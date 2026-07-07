import uuid
import random
import string
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from pydantic import BaseModel
from app.database import get_db
from app.models import Post, PostDraft, PostStatus, Notification, ActivityLog, User, PostMetric, Comment, LinkTracking, Task, TaskStatus, TaskCompletion
from app.services.auth_service import get_current_user, require_role

class UpdateLinkRequest(BaseModel):
    linkedin_url: str

router = APIRouter(prefix="/api/posts", tags=["posts"])
require_admin = require_role("admin")


class CreatePostRequest(BaseModel):
    title: str = ""
    content: str
    post_type: str = "general"
    region: str = "Global"
    tone: str = "professional"
    hashtags: str = ""
    scheduled_at: Optional[str] = None
    image_url: str = ""
    campaign_id: Optional[str] = None
    is_template: bool = False
    status: Optional[str] = None
    task_id: Optional[str] = None


class ApprovePostRequest(BaseModel):
    status: str  # approved / rejected
    comment: str = ""


@router.get("/")
async def list_posts(
    status: Optional[str] = None,
    region: Optional[str] = None,
    is_template: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Post)
    if current_user.role == "agent":
        q = q.where(Post.created_by_id == current_user.id)
    if status:
        q = q.where(Post.status == status)
    if region and region != "Global":
        q = q.where(Post.region == region)
    if is_template is not None:
        q = q.where(Post.is_template == is_template)
    q = q.order_by(Post.created_at.desc())
    result = await db.execute(q)
    posts = result.scalars().all()
    return [_post_dict(p) for p in posts]


@router.post("/", status_code=201)
async def create_post(
    req: CreatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sched = datetime.fromisoformat(req.scheduled_at) if req.scheduled_at else None
    if req.status:
        try:
            initial_status = PostStatus(req.status)
        except ValueError:
            initial_status = PostStatus.approved if current_user.role == "admin" else PostStatus.draft
    else:
        initial_status = PostStatus.approved if current_user.role == "admin" else PostStatus.draft

    final_status = PostStatus.scheduled if sched and (initial_status == PostStatus.approved or current_user.role == "admin") else initial_status

    post = Post(
        id=str(uuid.uuid4()),
        title=req.title,
        content=req.content,
        post_type=req.post_type,
        region=req.region,
        tone=req.tone,
        hashtags=req.hashtags,
        image_url=req.image_url,
        campaign_id=req.campaign_id,
        scheduled_at=sched,
        is_template=req.is_template,
        created_by_id=current_user.id,
        status=final_status,
        task_id=req.task_id,
    )
    db.add(post)
    await db.flush()

    # Save first draft version
    db.add(PostDraft(
        id=str(uuid.uuid4()),
        post_id=post.id,
        content=req.content,
        version=1,
        created_by_id=current_user.id,
    ))

    if current_user.role == "agent":
        admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
        for admin in admins.scalars():
            db.add(Notification(
                id=str(uuid.uuid4()),
                user_id=admin.id,
                type="pending_approval",
                title=f"Post pending review: {req.title or req.content[:60]}",
                body=f"From: {current_user.full_name}",
                reference_id=post.id,
                reference_type="post",
            ))
        # Notify the agent themselves
        db.add(Notification(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            type="post_submitted",
            title=f"Post submitted for review: {req.title or req.content[:60]}",
            body="Your post has been successfully submitted for review.",
            reference_id=post.id,
            reference_type="post",
        ))

    db.add(ActivityLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action="create_post",
        entity_type="post",
        entity_id=post.id,
    ))
    await db.commit()
    return _post_dict(post)


@router.get("/{post_id}")
async def get_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if current_user.role == "agent" and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _post_dict(post)


@router.post("/{post_id}/approve")
async def approve_post(
    post_id: str,
    req: ApprovePostRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if req.status == "approved":
        post.status = PostStatus.approved
        if post.task_id:
            # Update task assignment status to approved
            assignment_result = await db.execute(
                select(TaskAssignment).where(TaskAssignment.task_id == post.task_id, TaskAssignment.agent_id == post.created_by_id)
            )
            assignment = assignment_result.scalar_one_or_none()
            if assignment:
                assignment.status = "approved"
    else:
        post.status = PostStatus.rejected
        if post.task_id:
            # Reactivate associated task
            task_result = await db.execute(select(Task).where(Task.id == post.task_id))
            task = task_result.scalar_one_or_none()
            if task:
                task.status = TaskStatus.active
                task.completed_at = None
                # Clean up TaskCompletion record
                await db.execute(delete(TaskCompletion).where(TaskCompletion.task_id == post.task_id))
            # Update task assignment status to working
            assignment_result = await db.execute(
                select(TaskAssignment).where(TaskAssignment.task_id == post.task_id, TaskAssignment.agent_id == post.created_by_id)
            )
            assignment = assignment_result.scalar_one_or_none()
            if assignment:
                assignment.status = "working"
                assignment.accepted = True

    post.approved_by_id = current_user.id
    post.review_comment = req.comment or ""

    db.add(Notification(
        id=str(uuid.uuid4()),
        user_id=post.created_by_id,
        type=f"post_{req.status}",
        title=f"Post {req.status}",
        body=req.comment or f"Your post was {req.status}",
        reference_id=post.id,
        reference_type="post",
    ))
    await db.commit()
    return _post_dict(post)


@router.post("/{post_id}/publish")
async def publish_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # 1. Fetch using the API key of LinkedIn (simulate generating a LinkedIn post link).
    post_id_fake = str(random.randint(1000000000, 9999999999))
    linkedin_url = f"https://www.linkedin.com/feed/update/urn:li:share:{post_id_fake}"
    
    post.linkedin_post_id = linkedin_url
    post.status = PostStatus.published
    post.published_at = datetime.utcnow()
    
    if post.task_id:
        # Update task assignment status to posted
        assignment_result = await db.execute(
            select(TaskAssignment).where(TaskAssignment.task_id == post.task_id, TaskAssignment.agent_id == post.created_by_id)
        )
        assignment = assignment_result.scalar_one_or_none()
        if assignment:
            assignment.status = "posted"
    
    # 2. Automagically create a tracking link for this published post
    short_code = "".join(random.choices(string.ascii_letters + string.digits, k=8))
    link = LinkTracking(
        id=str(uuid.uuid4()),
        post_id=post.id,
        agent_id=current_user.id,
        original_url=linkedin_url,
        short_code=short_code,
        short_url=f"https://go.gorecruitai.com/{short_code}",
        utm_source="linkedin",
        utm_medium="social",
        utm_campaign=post.campaign_id or "linkedin-post",
        utm_content=post.id[:8],
        region=post.region,
        click_data="[]",
    )
    db.add(link)
    await db.commit()
    return _post_dict(post)


@router.post("/{post_id}/save-link")
async def save_linkedin_link(
    post_id: str,
    req: UpdateLinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Save the link
    post.linkedin_post_id = req.linkedin_url
    post.status = PostStatus.published
    if not post.published_at:
        post.published_at = datetime.utcnow()
        
    # Check if a LinkTracking already exists for this post. If not, create one!
    link_res = await db.execute(select(LinkTracking).where(LinkTracking.post_id == post.id))
    link = link_res.scalar_one_or_none()
    if not link:
        short_code = "".join(random.choices(string.ascii_letters + string.digits, k=8))
        new_link = LinkTracking(
            id=str(uuid.uuid4()),
            post_id=post.id,
            agent_id=post.created_by_id,
            original_url=req.linkedin_url,
            short_code=short_code,
            short_url=f"https://go.gorecruitai.com/{short_code}",
            utm_source="linkedin",
            utm_medium="social",
            utm_campaign=post.campaign_id or "linkedin-post",
            utm_content=post.id[:8],
            region=post.region,
            click_data="[]",
        )
        db.add(new_link)
    else:
        link.original_url = req.linkedin_url
        
    await db.commit()
    return _post_dict(post)


@router.post("/{post_id}/sync-metrics")
async def sync_linkedin_metrics(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
        
    likes = random.randint(12, 60)
    comments = random.randint(3, 18)
    shares = random.randint(1, 10)
    clicks = random.randint(20, 95)
    
    # Check if PostMetric already exists for today/this post
    metric_res = await db.execute(select(PostMetric).where(PostMetric.post_id == post_id))
    metric = metric_res.scalar_one_or_none()
    if not metric:
        metric = PostMetric(
            id=str(uuid.uuid4()),
            post_id=post_id,
            metric_date=datetime.utcnow().date(),
            impressions=likes * 14 + clicks,
            likes=likes,
            comments=comments,
            shares=shares,
            clicks=clicks,
        )
        db.add(metric)
    else:
        metric.likes = likes
        metric.comments = comments
        metric.shares = shares
        metric.clicks = clicks
        metric.impressions = likes * 14 + clicks
        
    await db.commit()
    return {
        "likes": metric.likes,
        "comments": metric.comments,
        "shares": metric.shares,
        "clicks": metric.clicks,
        "impressions": metric.impressions,
    }


@router.put("/{post_id}")
async def update_post(
    post_id: str,
    req: CreatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if current_user.role == "agent" and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Save new draft version
    draft_count = await db.execute(select(PostDraft).where(PostDraft.post_id == post_id))
    version = len(draft_count.scalars().all()) + 1
    db.add(PostDraft(id=str(uuid.uuid4()), post_id=post_id, content=req.content, version=version, created_by_id=current_user.id))

    post.content = req.content
    post.title = req.title
    post.hashtags = req.hashtags
    post.tone = req.tone
    post.region = req.region
    if req.scheduled_at:
        post.scheduled_at = datetime.fromisoformat(req.scheduled_at)
    await db.commit()
    return _post_dict(post)


@router.get("/kanban")
async def kanban_board(
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return posts grouped by kanban status columns."""
    statuses = ["draft", "rejected", "in_review", "approved", "scheduled"]
    board = {}
    for s in statuses:
        q = select(Post).where(Post.status == s)
        if region and region != "Global":
            q = q.where(Post.region == region)
        if current_user.role == "agent":
            q = q.where(Post.created_by_id == current_user.id)
        result = await db.execute(q.order_by(Post.created_at.desc()))
        board[s] = [_post_dict(p) for p in result.scalars()]
    return board


@router.post("/{post_id}/move-kanban")
async def move_kanban(
    post_id: str,
    new_status: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.status = new_status
    await db.commit()
    return _post_dict(post)


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check permission: admins can delete any post. agents can delete only their own posts.
    if current_user.role != "admin" and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")

    # Clean up post metrics (to avoid foreign key violations)
    await db.execute(delete(PostMetric).where(PostMetric.post_id == post_id))

    # Clear post association from link trackings
    await db.execute(update(LinkTracking).where(LinkTracking.post_id == post_id).values(post_id=None))

    # Clean up comments and notifications
    await db.execute(delete(Comment).where(Comment.entity_type == "post", Comment.entity_id == post_id))
    await db.execute(delete(Notification).where(Notification.reference_type == "post", Notification.reference_id == post_id))

    # Delete drafts and the post itself
    await db.execute(delete(PostDraft).where(PostDraft.post_id == post_id))

    await db.delete(post)
    await db.commit()
    return {"message": "Post deleted successfully"}


def _post_dict(p: Post) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "content": p.content,
        "status": p.status,
        "post_type": p.post_type,
        "region": p.region,
        "tone": p.tone,
        "hashtags": p.hashtags,
        "image_url": p.image_url,
        "is_template": p.is_template,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "created_by_id": p.created_by_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "campaign_id": p.campaign_id,
        "task_id": p.task_id,
        "predicted_reach": p.predicted_reach,
        "review_comment": p.review_comment,
        "linkedin_post_id": p.linkedin_post_id,
    }
