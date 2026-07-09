"""Notification helpers.

Centralises *who* gets notified for each workflow event so the admin/agent
responsibilities never clash: admins are notified of things they must act on,
and the agent(s) involved in a task are notified of decisions that affect them.
These helpers only stage rows (db.add); the caller owns the commit.
"""
import uuid
from typing import Iterable, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Notification, User, TaskAssignment


def _add(db: AsyncSession, user_ids: Iterable[str], type: str, title: str,
         body: str, reference_id: str, reference_type: str) -> None:
    seen = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        db.add(Notification(
            id=str(uuid.uuid4()),
            user_id=uid,
            type=type,
            title=title,
            body=body or "",
            reference_id=reference_id or "",
            reference_type=reference_type or "",
        ))


async def notify_users(db: AsyncSession, user_ids: Iterable[str], *, type: str,
                       title: str, body: str = "", reference_id: str = "",
                       reference_type: str = "") -> None:
    _add(db, list(user_ids), type, title, body, reference_id, reference_type)


async def notify_admins(db: AsyncSession, *, type: str, title: str, body: str = "",
                        reference_id: str = "", reference_type: str = "",
                        exclude_id: Optional[str] = None) -> None:
    res = await db.execute(select(User.id).where(User.role == "admin", User.is_active == True))
    ids = [i for i in res.scalars().all() if i != exclude_id]
    _add(db, ids, type, title, body, reference_id, reference_type)


async def task_agent_ids(db: AsyncSession, task_id: str,
                         claimed_by_id: Optional[str] = None,
                         created_by_id: Optional[str] = None) -> list:
    """The agent audience for a task: everyone assigned + whoever claimed it.

    Falls back to the creator (used for agent-created tasks that carry no
    assignment yet) so the right agent still hears about a decision.
    """
    res = await db.execute(select(TaskAssignment.agent_id).where(TaskAssignment.task_id == task_id))
    ids = list(res.scalars().all())
    if claimed_by_id:
        ids.append(claimed_by_id)
    if not ids and created_by_id:
        ids.append(created_by_id)
    # de-dup, preserve order
    out, seen = [], set()
    for i in ids:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out
