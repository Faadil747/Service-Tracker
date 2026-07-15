import uuid
import os
import random
import string
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import joinedload
from pydantic import BaseModel
from app.database import get_db
from app.models import Post, PostDraft, PostStatus, Notification, ActivityLog, User, PostMetric, Comment, LinkTracking
from app.services.auth_service import get_current_user, require_role
from app.services.notify import notify_admins, notify_users

class UpdateLinkRequest(BaseModel):
    linkedin_url: str


class ToggleEngagementRequest(BaseModel):
    employee_id: str
    action_type: str
    state: bool

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
    image_url: Optional[str] = None
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
    q = select(Post).options(joinedload(Post.creator))
    if is_template:
        # The template Library is a shared team resource — everyone sees every
        # template (no per-agent scoping), so saved templates are reusable by all.
        q = q.where(Post.is_template == True)
    else:
        # Keep templates out of the normal post lists (kanban / published / etc.).
        q = q.where(Post.is_template == False)
        if current_user.role == "agent":
            q = q.where(Post.created_by_id == current_user.id)
    if status:
        q = q.where(Post.status == status)
    if region and region != "Global":
        q = q.where(Post.region == region)
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
    is_admin = current_user.role == "admin"

    # Templates are library entries, not workflow posts: save straight to the
    # shared Library with no task linkage, no review notifications, and out of the
    # kanban board (status stays draft; the list/kanban queries filter templates).
    if req.is_template:
        post = Post(
            id=str(uuid.uuid4()),
            title=req.title,
            content=req.content,
            post_type=req.post_type,
            region=req.region,
            tone=req.tone,
            hashtags=req.hashtags,
            image_url=req.image_url or "",
            is_template=True,
            created_by_id=current_user.id,
            status=PostStatus.draft,
        )
        post.creator = current_user
        db.add(post)
        db.add(ActivityLog(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            action="save_template",
            entity_type="post",
            entity_id=post.id,
        ))
        await db.commit()
        return _post_dict(post)

    # Resolve the requested status safely.
    requested = None
    if req.status:
        try:
            requested = PostStatus(req.status)
        except ValueError:
            requested = None

    if req.task_id:
        # A draft attached to a task goes for review (an admin may act directly).
        initial_status = requested if (is_admin and requested) else PostStatus.in_review
    elif requested is not None:
        initial_status = requested
    else:
        initial_status = PostStatus.approved if is_admin else PostStatus.draft

    # Agents can never self-approve / schedule / publish — clamp to the review pipeline.
    if not is_admin and initial_status not in (PostStatus.draft, PostStatus.in_review):
        initial_status = PostStatus.in_review

    final_status = PostStatus.scheduled if (sched and is_admin and initial_status == PostStatus.approved) else initial_status

    post = Post(
        id=str(uuid.uuid4()),
        title=req.title,
        content=req.content,
        post_type=req.post_type,
        region=req.region,
        tone=req.tone,
        hashtags=req.hashtags,
        image_url=req.image_url or "",
        campaign_id=req.campaign_id,
        task_id=req.task_id,
        scheduled_at=sched,
        is_template=req.is_template,
        created_by_id=current_user.id,
        status=final_status,
    )
    post.creator = current_user
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

    # Link task integration
    if req.task_id:
        from app.models.task import Task, TaskStatus
        task_res = await db.execute(select(Task).where(Task.id == req.task_id))
        task = task_res.scalar_one_or_none()
        if task:
            task.status = TaskStatus.pending_approval
            # Notify admins of the pending approval task
            admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
            for admin in admins.scalars():
                db.add(Notification(
                    id=str(uuid.uuid4()),
                    user_id=admin.id,
                    type="pending_approval",
                    title=f"Task Pending Approval: {task.title}",
                    body=f"Agent {current_user.full_name} completed the draft and requested review.",
                    reference_id=task.id,
                    reference_type="task",
                ))
    elif current_user.role == "agent":
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
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.status = PostStatus.approved if req.status == "approved" else PostStatus.rejected
    post.approved_by_id = current_user.id
    post.review_comment = req.comment or ""

    # Link task integration
    if post.task_id:
        from app.models.task import Task, TaskStatus
        task_res = await db.execute(select(Task).where(Task.id == post.task_id))
        task = task_res.scalar_one_or_none()
        if task:
            if req.status == "approved":
                # Ready to post, keeps task in_progress or updates it
                # Task status can remain in_progress so it can be completed on publish
                task.status = TaskStatus.in_progress
            else:
                # Manager rejects (redo) -> moves task back to in_progress
                task.status = TaskStatus.in_progress

            decision = "approved — you can publish it now" if req.status == "approved" else "requested changes"
            await notify_users(
                db, [post.created_by_id],
                type=f"task_{req.status}",
                title=f"Draft {'approved' if req.status == 'approved' else 'needs revision'}: {task.title}",
                body=f"Manager {current_user.full_name} {decision}. Comments: {req.comment or 'None'}",
                reference_id=task.id,
                reference_type="task",
            )

    await notify_users(
        db, [post.created_by_id],
        type=f"post_{req.status}",
        title=f"Post {req.status}",
        body=req.comment or f"Your post was {req.status}",
        reference_id=post.id,
        reference_type="post",
    )
    await db.commit()
    return _post_dict(post)


@router.post("/{post_id}/request-review")
async def request_review(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Agent re-opens an approved (or rejected) post for another admin review,
    e.g. they spotted something to change before publishing. Bounces the linked
    task back to pending_approval and notifies the admins."""
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if current_user.role != "admin" and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only re-open your own posts")
    if post.status == PostStatus.published:
        raise HTTPException(status_code=400, detail="A published post cannot be sent back for review.")

    post.status = PostStatus.in_review
    post.approved_by_id = None

    ref_id, ref_type, title = post.id, "post", post.title or (post.content[:60] if post.content else "post")
    if post.task_id:
        from app.models.task import Task, TaskStatus
        task = (await db.execute(select(Task).where(Task.id == post.task_id))).scalar_one_or_none()
        if task and task.status != TaskStatus.completed:
            task.status = TaskStatus.pending_approval
            ref_id, ref_type, title = task.id, "task", task.title

    await notify_admins(
        db,
        type="pending_approval",
        title=f"Review requested again: {title}",
        body=f"{current_user.full_name} sent the post back for another review.",
        reference_id=ref_id,
        reference_type=ref_type,
    )
    await db.commit()
    return _post_dict(post)


# ── Media upload ────────────────────────────────────────────────────────────
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
_ALLOWED_MEDIA_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mov", ".webm"}


@router.post("/upload-media")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Store an uploaded image or video and return a URL to embed in a post."""
    content_type = file.content_type or ""
    if not (content_type.startswith("image/") or content_type.startswith("video/")):
        raise HTTPException(status_code=400, detail="Only image and video files are allowed")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_MEDIA_EXT:
        ext = ".png" if content_type.startswith("image/") else ".mp4"
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Media too large (max 50 MB)")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{name}"}


async def complete_linked_task(post: Post, db: AsyncSession, current_user: User):
    if post.task_id:
        from app.models.task import Task, TaskStatus, TaskCompletion
        task_res = await db.execute(select(Task).where(Task.id == post.task_id))
        task = task_res.scalar_one_or_none()
        if task and task.status != TaskStatus.completed:
            task.status = TaskStatus.completed
            task.completed_at = datetime.utcnow()
            
            # Create completion entry
            db.add(TaskCompletion(
                id=str(uuid.uuid4()),
                task_id=task.id,
                agent_id=post.created_by_id or current_user.id,
                notes=f"Post published: {post.linkedin_post_id}",
            ))
            
            # Notify admins the task is complete.
            await notify_admins(
                db,
                type="task_completed",
                title=f"Task Completed: {task.title}",
                body=f"Completed via post publication by {current_user.full_name}",
                reference_id=task.id,
                reference_type="task",
            )


async def publish_post_to_linkedin(post: Post, db: AsyncSession, current_user: User):
    """Push a post live to LinkedIn, mark it published, complete the linked task and
    create its UTM tracking link — exactly once.

    This is the single source of truth for "make a post go live". Both the agent
    publish endpoint and the admin approve-and-publish flow call it, so the two
    paths can never diverge. It performs no permission or approval-gate checks —
    the caller is responsible for those. Idempotent: a post that is already
    published is left untouched. Does NOT commit; the caller owns the transaction."""
    if post.status == PostStatus.published:
        return  # already live — nothing to do

    # Atomically claim the publish so two concurrent requests — e.g. an admin
    # double-clicking "Approve & Publish" — can't both fire a live LinkedIn post.
    # Same atomic-claim pattern as accept_task: a second caller's UPDATE blocks
    # until this transaction commits, then matches 0 rows and returns before posting.
    claim = await db.execute(
        update(Post)
        .where(Post.id == post.id, Post.status != PostStatus.published)
        .values(status=PostStatus.published, published_at=datetime.utcnow())
    )
    if claim.rowcount == 0:
        return  # another in-flight request already published it
    post.status = PostStatus.published
    if post.published_at is None:
        post.published_at = datetime.utcnow()

    from app.config import settings
    linkedin_url = None

    if settings.LINKEDIN_ACCESS_TOKEN and settings.LINKEDIN_ORG_ID:
        try:
            from app.services.linkedin_service import linkedin_service
            res = await linkedin_service.publish_post(
                access_token=settings.LINKEDIN_ACCESS_TOKEN,
                org_id=settings.LINKEDIN_ORG_ID,
                content=post.content,
            )
            if res and "linkedin_post_id" in res:
                post_id_raw = res["linkedin_post_id"]
                if post_id_raw.startswith("stub_"):
                    pass  # No real token — fall through to stub URL
                elif post_id_raw.startswith("urn:"):
                    linkedin_url = f"https://www.linkedin.com/feed/update/{post_id_raw}"
                else:
                    linkedin_url = f"https://www.linkedin.com/feed/update/urn:li:share:{post_id_raw}"
        except Exception as e:
            print(f"LinkedIn publishing error: {e}")
            raise HTTPException(status_code=400, detail=f"LinkedIn API error: {str(e)}")

    if not linkedin_url:
        linkedin_url = f"https://www.linkedin.com/feed/update/urn:li:share:{random.randint(1000000000, 9999999999)}"
    post.linkedin_post_id = linkedin_url  # status/published_at already set by the atomic claim above

    # Complete the linked task (marks it done + notifies admins).
    await complete_linked_task(post, db, current_user)

    # Auto-generate a UTM tracking link for this published post — but only once.
    # Attribute it to the post's author so the owning agent sees it in their Link
    # Analytics (admins see every link regardless).
    existing = await db.execute(select(LinkTracking).where(LinkTracking.post_id == post.id))
    if existing.scalar_one_or_none() is None:
        short_code = "".join(random.choices(string.ascii_letters + string.digits, k=8))
        db.add(LinkTracking(
            id=str(uuid.uuid4()),
            post_id=post.id,
            agent_id=post.created_by_id or current_user.id,
            original_url=linkedin_url,
            short_code=short_code,
            short_url=f"https://go.gorecruitai.com/{short_code}",
            utm_source="linkedin",
            utm_medium="social",
            utm_campaign=post.campaign_id or "linkedin-post",
            utm_content=post.id[:8],
            region=post.region,
            click_data="[]",
        ))


@router.post("/{post_id}/publish")
async def publish_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Only the author (agent) or an admin may publish.
    if current_user.role != "admin" and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only publish your own posts")

    # Publishing is gated on admin approval — never allow an unapproved draft to go live.
    if post.status == PostStatus.published:
        return _post_dict(post)  # already live — idempotent
    if post.status not in (PostStatus.approved, PostStatus.scheduled):
        raise HTTPException(status_code=400, detail="This post must be approved by an admin before it can be published.")

    # Push it live via the shared publisher (LinkedIn + task completion + tracking link).
    await publish_post_to_linkedin(post, db, current_user)
    await db.commit()
    return _post_dict(post)


@router.post("/{post_id}/save-link")
async def save_linkedin_link(
    post_id: str,
    req: UpdateLinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Only the author (agent) or an admin may attach a live link, and only once the
    # post has been approved — this path also marks it published + completes the task.
    if current_user.role != "admin" and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own posts")
    if post.status not in (PostStatus.approved, PostStatus.scheduled, PostStatus.published):
        raise HTTPException(status_code=400, detail="This post must be approved by an admin before it can be marked as published.")

    # Save the link
    post.linkedin_post_id = req.linkedin_url
    post.status = PostStatus.published
    if not post.published_at:
        post.published_at = datetime.utcnow()

    # Complete linked task
    await complete_linked_task(post, db, current_user)
        
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


@router.post("/{post_id}/toggle-engagement")
async def toggle_employee_engagement(
    post_id: str,
    req: ToggleEngagementRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import json
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    try:
        engagement = json.loads(post.employee_engagement or "{}")
    except Exception:
        engagement = {}

    emp_id = req.employee_id
    act_type = req.action_type
    state = req.state

    if emp_id not in engagement:
        engagement[emp_id] = {"like": False, "comment": False, "share": False}

    engagement[emp_id][act_type] = state

    post.employee_engagement = json.dumps(engagement)
    await db.commit()
    return {"status": "success", "employee_engagement": engagement, "post": _post_dict(post)}


@router.post("/{post_id}/sync-metrics")
async def sync_linkedin_metrics(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync per-post engagement from LinkedIn.

    NOTE: LinkedIn will not expose per-post likes/comments/shares to this token —
    the socialActions endpoint returns HTTP 403 (it requires Community Management
    API partner access). Rather than fabricate numbers, we report it as
    unavailable. Aggregate company-page engagement IS available and is surfaced on
    the Analytics dashboard via /api/metrics/linkedin-overview.
    """
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Return any real per-post metrics we already have stored; never invent them.
    metric_res = await db.execute(select(PostMetric).where(PostMetric.post_id == post_id))
    metric = metric_res.scalar_one_or_none()
    if metric:
        return {
            "available": True,
            "likes": metric.likes,
            "comments": metric.comments,
            "shares": metric.shares,
            "clicks": metric.clicks,
            "impressions": metric.impressions,
        }
    return {
        "available": False,
        "reason": "Per-post engagement is not available via the LinkedIn API for this token "
                  "(requires Community Management API access). See aggregate page analytics instead.",
    }


@router.put("/{post_id}")
async def update_post(
    post_id: str,
    req: CreatePostRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    is_admin = current_user.role == "admin"
    if not is_admin and post.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not is_admin and post.status == PostStatus.published:
        raise HTTPException(status_code=400, detail="A published post can no longer be edited.")

    content_changed = req.content is not None and req.content != post.content
    was_reviewed = post.status in (PostStatus.approved, PostStatus.rejected, PostStatus.scheduled)

    # Save new draft version
    draft_count = await db.execute(select(PostDraft).where(PostDraft.post_id == post_id))
    version = len(draft_count.scalars().all()) + 1
    db.add(PostDraft(id=str(uuid.uuid4()), post_id=post_id, content=req.content, version=version, created_by_id=current_user.id))

    post.content = req.content
    post.title = req.title
    post.hashtags = req.hashtags
    post.tone = req.tone
    post.region = req.region
    if req.image_url is not None:
        post.image_url = req.image_url
    if req.scheduled_at:
        post.scheduled_at = datetime.fromisoformat(req.scheduled_at)

    # If an agent edits content that already passed (or failed) review, or explicitly
    # requests review (req.status == 'in_review'), it must go back for re-approval.
    should_re_review = False
    if not is_admin:
        if (content_changed and was_reviewed) or req.status == "in_review" or req.status == PostStatus.in_review:
            should_re_review = True

    if should_re_review:
        post.status = PostStatus.in_review
        post.approved_by_id = None
        if post.task_id:
            from app.models.task import Task, TaskStatus
            task = (await db.execute(select(Task).where(Task.id == post.task_id))).scalar_one_or_none()
            if task and task.status != TaskStatus.completed:
                task.status = TaskStatus.pending_approval
                await notify_admins(
                    db,
                    type="pending_approval",
                    title=f"Draft re-submitted: {task.title}",
                    body=f"{current_user.full_name} edited the draft — it needs re-approval.",
                    reference_id=task.id,
                    reference_type="task",
                )
        else:
            await notify_admins(
                db,
                type="pending_approval",
                title=f"Post re-submitted: {post.title or post.content[:60]}",
                body=f"{current_user.full_name} edited the post — it needs re-approval.",
                reference_id=post.id,
                reference_type="post",
            )
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
        q = select(Post).options(joinedload(Post.creator)).where(Post.status == s, Post.is_template == False)
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

    try:
        target = PostStatus(new_status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    if current_user.role != "admin":
        if post.created_by_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only move your own posts")
        # Agents move within the drafting stage only; approving/scheduling/publishing is admin-only.
        if target not in (PostStatus.draft, PostStatus.in_review):
            raise HTTPException(status_code=403, detail="Only an admin can approve, schedule, or publish posts.")

    post.status = target
    await db.commit()
    return _post_dict(post)


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).options(joinedload(Post.creator)).where(Post.id == post_id))
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
    import json
    creator_name = ""
    creator_avatar = ""
    try:
        if p.creator:
            creator_name = p.creator.full_name
            creator_avatar = p.creator.avatar_url
    except Exception:
        pass

    try:
        engagement = json.loads(p.employee_engagement or "{}")
    except Exception:
        engagement = {}

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
        "created_by_name": creator_name,
        "created_by_avatar": creator_avatar,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "campaign_id": p.campaign_id,
        "task_id": p.task_id,
        "predicted_reach": p.predicted_reach,
        "review_comment": p.review_comment,
        "linkedin_post_id": p.linkedin_post_id,
        "employee_engagement": engagement,
    }
