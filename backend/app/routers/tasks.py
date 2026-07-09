import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from pydantic import BaseModel
from app.database import get_db
from app.models import Task, TaskAssignment, TaskCompletion, TaskApproval, Notification, ActivityLog, User, TaskStatus, Comment, Post
from app.services.auth_service import get_current_user, require_role
from app.services.notify import notify_admins, notify_users, task_agent_ids

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
require_admin = require_role("admin")


async def _is_assigned(db: AsyncSession, task_id: str, agent_id: str) -> bool:
    res = await db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task_id, TaskAssignment.agent_id == agent_id)
    )
    return res.scalar_one_or_none() is not None


class CreateTaskRequest(BaseModel):
    title: str
    description: str = ""
    region: str = "Global"
    due_date: Optional[str] = None
    recurrence: str = "none"
    assigned_to: Optional[str] = None
    assigned_to_id: Optional[str] = None
    assigned_to_ids: Optional[List[str]] = None
    campaign_id: Optional[str] = None


class ApproveTaskRequest(BaseModel):
    status: str  # approved / rejected
    comment: str = ""


class BulkDeleteRequest(BaseModel):
    task_ids: List[str]


@router.get("/")
async def list_tasks(
    status: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    agent_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Task)
    if current_user.role == "agent":
        # Agents see tasks assigned to them
        q = q.join(TaskAssignment, Task.id == TaskAssignment.task_id).where(TaskAssignment.agent_id == current_user.id)
    if status:
        q = q.where(Task.status == status)
    if region and region != "Global":
        q = q.where(Task.region == region)
    if search:
        q = q.where(Task.title.ilike(f"%{search}%"))
    if agent_id and current_user.role == "admin":
        q = q.join(TaskAssignment, Task.id == TaskAssignment.task_id, isouter=True).where(TaskAssignment.agent_id == agent_id)
    q = q.order_by(Task.created_at.desc())
    result = await db.execute(q)
    tasks = result.scalars().all()
    return [await _task_dict(t, db) for t in tasks]


@router.post("/", status_code=201)
async def create_task(
    req: CreateTaskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    due = datetime.fromisoformat(req.due_date) if req.due_date else None
    initial_status = TaskStatus.active if current_user.role == "admin" else TaskStatus.pending_approval

    task = Task(
        id=str(uuid.uuid4()),
        title=req.title,
        description=req.description,
        region=req.region,
        due_date=due,
        recurrence=req.recurrence,
        campaign_id=req.campaign_id,
        created_by_id=current_user.id,
        status=initial_status,
    )
    db.add(task)
    await db.flush()

    # Only an admin may assign a task to agents. An agent-created task is a
    # proposal that an admin assigns after approving it.
    target_agents = []
    if current_user.role == "admin":
        target_agents = req.assigned_to_ids or []
        if not target_agents and (req.assigned_to_id or req.assigned_to):
            target_agents = [req.assigned_to_id or req.assigned_to]

    for target_agent in target_agents:
        assignment = TaskAssignment(id=str(uuid.uuid4()), task_id=task.id, agent_id=target_agent)
        db.add(assignment)
        # Notify assigned agent
        notif = Notification(
            id=str(uuid.uuid4()),
            user_id=target_agent,
            type="task_assigned",
            title=f"New task assigned: {req.title}",
            body=req.description or "",
            reference_id=task.id,
            reference_type="task",
        )
        db.add(notif)

    # If agent, create approval record and notify admins
    if current_user.role == "agent":
        approval = TaskApproval(
            id=str(uuid.uuid4()),
            task_id=task.id,
            approver_id=current_user.id,  # placeholder
            status="pending",
        )
        db.add(approval)
        # Notify all admins
        admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
        for admin in admins.scalars():
            db.add(Notification(
                id=str(uuid.uuid4()),
                user_id=admin.id,
                type="pending_approval",
                title=f"Task pending approval: {req.title}",
                body=f"From agent: {current_user.full_name}",
                reference_id=task.id,
                reference_type="task",
            ))

    # Log
    db.add(ActivityLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action="create_task",
        entity_type="task",
        entity_id=task.id,
        metadata_json=f'{{"title": "{req.title}"}}',
    ))
    await db.commit()
    return await _task_dict(task, db)


@router.get("/pending-approvals")
async def pending_approvals(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.status == TaskStatus.pending_approval))
    tasks = result.scalars().all()
    return [await _task_dict(t, db) for t in tasks]


@router.post("/{task_id}/approve")
async def approve_task(
    task_id: str,
    req: ApproveTaskRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if req.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")
    if task.status == TaskStatus.completed:
        raise HTTPException(status_code=400, detail="This task is already completed.")

    approved = req.status == "approved"

    # Find the draft under review (if any) so task/post status stay in lock-step.
    post_res = await db.execute(select(Post).where(Post.task_id == task_id).order_by(Post.created_at.desc()))
    post = post_res.scalars().first()

    if approved:
        # Go-ahead: claimed drafts become "ready to publish"; unclaimed tasks open up.
        task.status = TaskStatus.in_progress if task.claimed_by_id else TaskStatus.active
    else:
        # Rejection of a claimed draft bounces it back for revision (stays in the
        # agent's active queue). Rejecting an unclaimed proposal declines the task.
        task.status = TaskStatus.in_progress if (post is not None or task.claimed_by_id) else TaskStatus.rejected
    task.approved_by_id = current_user.id
    task.approved_at = datetime.utcnow()

    if post:
        from app.models.post import PostStatus
        post.status = PostStatus.approved if approved else PostStatus.rejected
        post.approved_by_id = current_user.id
        post.review_comment = req.comment or ""

    # Update approval record
    appr_result = await db.execute(select(TaskApproval).where(TaskApproval.task_id == task_id, TaskApproval.status == "pending"))
    approval = appr_result.scalar_one_or_none()
    if approval:
        approval.approver_id = current_user.id
        approval.status = req.status
        approval.comment = req.comment
        approval.decided_at = datetime.utcnow()

    # Notify the agent(s) working the task — never the approving admin.
    recipients = await task_agent_ids(db, task.id, task.claimed_by_id, task.created_by_id)
    ready_msg = "Approved — you can publish it now." if post is not None else "Approved — you can start."
    await notify_users(
        db, recipients,
        type=f"task_{req.status}",
        title=f"Task {'approved' if approved else 'needs revision'}: {task.title}",
        body=req.comment or (ready_msg if approved else f"Sent back for revision by {current_user.full_name}"),
        reference_id=task.id,
        reference_type="task",
    )
    await db.commit()
    return await _task_dict(task, db)


@router.post("/{task_id}/complete")
async def complete_task(
    task_id: str,
    notes: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Completion is publish-gated: a task is completed by publishing its approved
    # post, never marked done early by either side. (Publishing auto-completes it;
    # this endpoint is a guarded fallback that enforces the same rule.)
    from app.models.post import PostStatus
    post_res = await db.execute(select(Post).where(Post.task_id == task_id).order_by(Post.created_at.desc()))
    post = post_res.scalars().first()
    if not (post and post.status == PostStatus.published):
        raise HTTPException(status_code=400, detail="A task is completed by publishing its approved post.")

    # Only the agent working the task (or an admin) may finalize it.
    if current_user.role != "admin" and current_user.id not in (task.claimed_by_id, task.created_by_id):
        raise HTTPException(status_code=403, detail="Not authorized to complete this task")

    if task.status == TaskStatus.completed:
        return {"message": "Task already completed", "completed_at": task.completed_at.isoformat() if task.completed_at else None}

    task.status = TaskStatus.completed
    task.completed_at = datetime.utcnow()

    db.add(TaskCompletion(
        id=str(uuid.uuid4()),
        task_id=task.id,
        agent_id=task.claimed_by_id or current_user.id,
        notes=notes,
    ))
    db.add(ActivityLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action="complete_task",
        entity_type="task",
        entity_id=task.id,
    ))

    # Notify all admins that the task is completed.
    await notify_admins(
        db,
        type="task_completed",
        title=f"Task Completed: {task.title}",
        body=f"Completed by {current_user.full_name}. Notes: {notes}" if notes else f"Completed by {current_user.full_name}",
        reference_id=task.id,
        reference_type="task",
    )

    await db.commit()
    return {"message": "Task completed", "completed_at": task.completed_at.isoformat()}


@router.get("/accountability")
async def accountability_report(
    region: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Agents responsible for a task that is now past its due date and not finished."""
    now = datetime.utcnow()
    q = select(Task).where(
        Task.status.in_([TaskStatus.active, TaskStatus.in_progress]),
        Task.due_date.isnot(None),
        Task.due_date < now,  # strictly overdue — a task due later today is not "missed" yet
    )
    if region and region != "Global":
        q = q.where(Task.region == region)
    result = await db.execute(q)
    overdue = result.scalars().all()

    missed = []
    for t in overdue:
        # Blame whoever took the task; if still unclaimed, the assigned agent(s).
        if t.claimed_by_id:
            agent_ids = [t.claimed_by_id]
        else:
            assigns = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == t.id))
            agent_ids = [a.agent_id for a in assigns.scalars()]
        for aid in agent_ids:
            agent = (await db.execute(select(User).where(User.id == aid))).scalar_one_or_none()
            if agent:
                missed.append({
                    "task_id": t.id,
                    "task_title": t.title,
                    "agent_id": agent.id,
                    "agent_name": agent.full_name,
                    "claimed": bool(t.claimed_by_id),  # False = assigned but never accepted
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                })
    return missed


@router.post("/bulk-delete")
async def bulk_delete_tasks(
    req: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete many tasks at once. Admins may delete any task; agents may delete only
    tasks they created. Tasks the caller isn't allowed to delete are skipped."""
    deleted, skipped = [], []
    for tid in req.task_ids:
        task = (await db.execute(select(Task).where(Task.id == tid))).scalar_one_or_none()
        if not task:
            skipped.append(tid)
            continue
        if current_user.role != "admin" and task.created_by_id != current_user.id:
            skipped.append(tid)
            continue
        await db.execute(delete(Comment).where(Comment.entity_type == "task", Comment.entity_id == tid))
        await db.execute(delete(Notification).where(Notification.reference_type == "task", Notification.reference_id == tid))
        await db.delete(task)
        deleted.append(tid)
    await db.commit()
    return {"deleted": deleted, "skipped": skipped, "deleted_count": len(deleted), "skipped_count": len(skipped)}


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Only an admin or the task's creator may delete it. An assigned agent must not
    # be able to delete a task to dodge it.
    if current_user.role != "admin" and task.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only an admin or the task creator can delete this task")

    # Clean up associated comments & notifications manually
    await db.execute(delete(Comment).where(Comment.entity_type == "task", Comment.entity_id == task_id))
    await db.execute(delete(Notification).where(Notification.reference_type == "task", Notification.reference_id == task_id))

    await db.delete(task)
    await db.commit()
    return {"message": "Task deleted successfully"}


@router.put("/{task_id}/status")
async def update_task_status(
    task_id: str,
    status: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        new_status = TaskStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    # Completion is publish-gated and cannot be forced from here.
    if new_status == TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Tasks complete automatically when the approved post is published.")

    task.status = new_status
    task.completed_at = None

    # Notify the agent(s) working the task.
    recipients = await task_agent_ids(db, task.id, task.claimed_by_id, task.created_by_id)
    await notify_users(db, recipients, type="task_updated",
                       title=f"Task status updated: {task.title}",
                       body=f"Admin {current_user.full_name} moved it to '{status}'.",
                       reference_id=task.id, reference_type="task")

    await db.commit()
    return await _task_dict(task, db)


@router.post("/{task_id}/assign")
async def assign_task(
    task_id: str,
    agent_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin assigns (or adds) an agent to an existing task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    agent = (await db.execute(select(User).where(User.id == agent_id, User.is_active == True))).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not await _is_assigned(db, task_id, agent_id):
        db.add(TaskAssignment(id=str(uuid.uuid4()), task_id=task_id, agent_id=agent_id))
        await notify_users(db, [agent_id], type="task_assigned",
                           title=f"New task assigned: {task.title}",
                           body=task.description or "",
                           reference_id=task.id, reference_type="task")
    await db.commit()
    return await _task_dict(task, db)


@router.post("/{task_id}/accept")
async def accept_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify the user is assigned to this task
    if not await _is_assigned(db, task_id, current_user.id):
        raise HTTPException(status_code=403, detail="You are not assigned to this task")

    # Only an approved, still-open task can be accepted.
    if task.status != TaskStatus.active:
        if task.status == TaskStatus.pending_approval:
            raise HTTPException(status_code=400, detail="This task is still awaiting admin approval.")
        if task.status == TaskStatus.completed:
            raise HTTPException(status_code=400, detail="This task is already completed.")
        raise HTTPException(status_code=400, detail="This task can no longer be accepted.")

    # Atomic claim: succeeds only while still unclaimed — prevents two agents racing.
    claim = await db.execute(
        update(Task)
        .where(Task.id == task_id, Task.claimed_by_id.is_(None))
        .values(claimed_by_id=current_user.id, status=TaskStatus.in_progress)
    )
    if claim.rowcount == 0:
        raise HTTPException(status_code=400, detail="Task has already been taken by another agent")
    # Keep the in-memory object in sync with the atomic update.
    task.claimed_by_id = current_user.id
    task.status = TaskStatus.in_progress

    # Notify admins it's now in progress, and let co-assignees know it's taken.
    await notify_admins(db, type="task_accepted", title=f"Task taken: {task.title}",
                        body=f"Claimed by {current_user.full_name}", reference_id=task.id, reference_type="task")
    others = [a for a in await task_agent_ids(db, task.id) if a != current_user.id]
    await notify_users(db, others, type="task_locked", title=f"Task taken: {task.title}",
                       body=f"{current_user.full_name} is now working on this task.",
                       reference_id=task.id, reference_type="task")

    db.add(ActivityLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action="accept_task",
        entity_type="task",
        entity_id=task.id,
    ))
    await db.commit()
    return await _task_dict(task, db)


async def _task_dict(task: Task, db: AsyncSession) -> dict:
    assignments = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == task.id))
    assign_list = [{"agent_id": a.agent_id} for a in assignments.scalars()]

    claimed_by_name = None
    if task.claimed_by_id:
        claimed_user_res = await db.execute(select(User).where(User.id == task.claimed_by_id))
        claimed_user = claimed_user_res.scalar_one_or_none()
        if claimed_user:
            claimed_by_name = claimed_user.full_name

    post_res = await db.execute(select(Post).where(Post.task_id == task.id).order_by(Post.created_at.desc()))
    post = post_res.scalars().first()
    post_info = None
    if post:
        post_info = {
            "id": post.id,
            "title": post.title,
            "content": post.content,
            "status": post.status.value if hasattr(post.status, "value") else str(post.status),
            "tone": post.tone,
            "hashtags": post.hashtags,
            "image_url": post.image_url,
            "review_comment": post.review_comment or "",
        }

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "region": task.region,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "recurrence": task.recurrence,
        "created_by_id": task.created_by_id,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "assignments": assign_list,
        "claimed_by_id": task.claimed_by_id,
        "claimed_by_name": claimed_by_name,
        "post": post_info,
    }
