import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from pydantic import BaseModel
from app.database import get_db
from app.models import Post, PostDraft, PostStatus, Notification, ActivityLog, User, PostMetric, Comment, LinkTracking
from app.services.auth_service import get_current_user, require_role

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
    initial_status = PostStatus.approved if current_user.role == "admin" else PostStatus.draft

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
        status=PostStatus.scheduled if sched and current_user.role == "admin" else initial_status,
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

    db.add(ActivityLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action="create_post",
        entity_type="post",
        entity_id=post.id,
    ))
    await db.commit()
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

    post.status = PostStatus.approved if req.status == "approved" else PostStatus.rejected
    post.approved_by_id = current_user.id

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
    statuses = ["draft", "in_review", "approved", "scheduled"]
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
        "predicted_reach": p.predicted_reach,
    }
