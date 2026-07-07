import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete, cast, Date
from pydantic import BaseModel
from app.database import get_db
from app.models import Task, TaskAssignment, TaskCompletion, TaskApproval, Notification, ActivityLog, User, TaskStatus, Comment
from app.services.auth_service import get_current_user, require_role

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
require_admin = require_role("admin")


class CreateTaskRequest(BaseModel):
    title: str
    description: str = ""
    region: str = "Global"
    due_date: Optional[str] = None
    recurrence: str = "none"
    assigned_to: Optional[str] = None
    assigned_to_id: Optional[str] = None
    assigned_agent_ids: Optional[List[str]] = None
    campaign_id: Optional[str] = None


class ApproveTaskRequest(BaseModel):
    status: str  # approved / rejected
    comment: str = ""


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

    # Assign to agent(s)
    agent_ids = []
    if req.assigned_agent_ids:
        agent_ids = req.assigned_agent_ids
    elif req.assigned_to_id or req.assigned_to:
        agent_ids = [req.assigned_to_id or req.assigned_to]

    for agent_id in agent_ids:
        assignment = TaskAssignment(
            id=str(uuid.uuid4()),
            task_id=task.id,
            agent_id=agent_id,
            accepted=False,
            status="assigned"
        )
        db.add(assignment)
        # Notify assigned agent
        notif = Notification(
            id=str(uuid.uuid4()),
            user_id=agent_id,
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
            approver_id=current_user.id,  # placeholder — will be updated on approval
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

    new_status = TaskStatus.active if req.status == "approved" else TaskStatus.rejected
    task.status = new_status
    task.approved_by_id = current_user.id
    task.approved_at = datetime.utcnow()

    # Update approval record
    appr_result = await db.execute(select(TaskApproval).where(TaskApproval.task_id == task_id, TaskApproval.status == "pending"))
    approval = appr_result.scalar_one_or_none()
    if approval:
        approval.approver_id = current_user.id
        approval.status = req.status
        approval.comment = req.comment
        approval.decided_at = datetime.utcnow()

    # Notify creator
    db.add(Notification(
        id=str(uuid.uuid4()),
        user_id=task.created_by_id,
        type=f"task_{req.status}",
        title=f"Task {req.status}: {task.title}",
        body=req.comment or f"Your task was {req.status} by {current_user.full_name}",
        reference_id=task.id,
        reference_type="task",
    ))
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

    task.status = TaskStatus.completed
    task.completed_at = datetime.utcnow()

    # Update assignment status
    assignment_result = await db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task.id, TaskAssignment.agent_id == current_user.id)
    )
    assignment = assignment_result.scalar_one_or_none()
    if assignment:
        assignment.status = "waiting_for_approval"

    db.add(TaskCompletion(
        id=str(uuid.uuid4()),
        task_id=task.id,
        agent_id=current_user.id,
        notes=notes,
    ))
    db.add(ActivityLog(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action="complete_task",
        entity_type="task",
        entity_id=task.id,
    ))
    
    # Notify all admins that the task is completed
    admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
    for admin in admins.scalars():
        db.add(Notification(
            id=str(uuid.uuid4()),
            user_id=admin.id,
            type="task_completed",
            title=f"Task Completed: {task.title}",
            body=f"Completed by {current_user.full_name}. Notes: {notes}" if notes else f"Completed by {current_user.full_name}",
            reference_id=task.id,
            reference_type="task",
        ))

    await db.commit()
    return {"message": "Task completed", "completed_at": task.completed_at.isoformat()}


@router.post("/{task_id}/accept")
async def accept_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task_id, TaskAssignment.agent_id == current_user.id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Task assignment not found")

    assignment.accepted = True
    assignment.status = "working"

    # Remove all other assignments for this task
    await db.execute(
        delete(TaskAssignment).where(TaskAssignment.task_id == task_id, TaskAssignment.agent_id != current_user.id)
    )
    
    # Retrieve updated task
    task_res = await db.execute(select(Task).where(Task.id == task_id))
    task = task_res.scalar_one_or_none()
    await db.commit()
    if task:
        return await _task_dict(task, db)
    return {"message": "Task accepted", "status": assignment.status}


@router.get("/accountability")
async def accountability_report(
    region: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Who has NOT completed tasks that were due today."""
    today = datetime.utcnow().date()
    q = select(Task).where(
        Task.status.in_([TaskStatus.active, TaskStatus.in_progress]),
        cast(Task.due_date, Date) <= today,
    )
    if region and region != "Global":
        q = q.where(Task.region == region)
    result = await db.execute(q)
    overdue = result.scalars().all()

    missed = []
    for t in overdue:
        assign_result = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == t.id))
        for assign in assign_result.scalars():
            agent_result = await db.execute(select(User).where(User.id == assign.agent_id))
            agent = agent_result.scalar_one_or_none()
            if agent:
                missed.append({"task_id": t.id, "task_title": t.title, "agent_id": agent.id, "agent_name": agent.full_name, "due_date": t.due_date.isoformat() if t.due_date else None})
    return missed


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

    # Check permissions: admins can delete anything. agents can delete if they created it or are assigned to it.
    if current_user.role != "admin" and task.created_by_id != current_user.id:
        assign_result = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == task_id, TaskAssignment.agent_id == current_user.id))
        if not assign_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not authorized to delete this task")

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
    current_user: User = Depends(get_current_user),
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

    # Check permissions
    if current_user.role != "admin" and task.created_by_id != current_user.id:
        assign_result = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == task_id, TaskAssignment.agent_id == current_user.id))
        if not assign_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not authorized to update this task status")

    task.status = new_status
    if new_status == TaskStatus.completed:
        task.completed_at = datetime.utcnow()
    else:
        task.completed_at = None

    # Determine who to notify
    if current_user.role == "agent":
        # Agent updated, notify admins
        admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
        for admin in admins.scalars():
            db.add(Notification(
                id=str(uuid.uuid4()),
                user_id=admin.id,
                type="task_updated",
                title=f"Task Status Updated: {task.title}",
                body=f"{current_user.full_name} moved task to '{status}'",
                reference_id=task.id,
                reference_type="task",
            ))
    else:
        # Admin updated, notify assigned agents
        assignments = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == task_id))
        for assign in assignments.scalars():
            db.add(Notification(
                id=str(uuid.uuid4()),
                user_id=assign.agent_id,
                type="task_updated",
                title=f"Task Status Updated: {task.title}",
                body=f"Admin {current_user.full_name} moved task to '{status}'",
                reference_id=task.id,
                reference_type="task",
            ))

    await db.commit()
    return await _task_dict(task, db)


async def _task_dict(task: Task, db: AsyncSession) -> dict:
    assignments = await db.execute(select(TaskAssignment).where(TaskAssignment.task_id == task.id))
    assign_list = []
    for a in assignments.scalars():
        agent_user = await db.get(User, a.agent_id)
        assign_list.append({
            "agent_id": a.agent_id,
            "agent_name": agent_user.full_name if agent_user else "Unknown Agent",
            "accepted": a.accepted,
            "status": a.status
        })
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
    }
