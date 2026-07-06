import uuid
import secrets
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models import User, Task, TaskCompletion, TaskAssignment
from app.services.auth_service import get_current_user, require_role, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])
require_admin = require_role("admin")


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "agent"
    region: str = "Global"
    linkedin_url: str = ""


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    region: Optional[str] = None
    linkedin_url: Optional[str] = None
    avatar_url: Optional[str] = None


@router.get("/")
async def list_users(
    role: Optional[str] = None,
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(User).where(User.is_active == True)
    if role:
        q = q.where(User.role == role)
    if region and region != "Global":
        q = q.where(User.region == region)
    result = await db.execute(q)
    users = result.scalars().all()
    return [_user_dict(u) for u in users]


@router.post("/", status_code=201)
async def create_agent(
    req: CreateUserRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin creates an agent and returns temp credentials."""
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")

    temp_password = secrets.token_urlsafe(12)
    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        full_name=req.full_name,
        hashed_password=hash_password(temp_password),
        role=req.role,
        region=req.region,
        linkedin_url=req.linkedin_url,
    )
    db.add(user)
    await db.commit()
    return {**_user_dict(user), "temp_password": temp_password}


@router.delete("/{user_id}")
async def remove_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.commit()
    return {"message": "User deactivated"}


@router.get("/{user_id}/stats")
async def get_user_stats(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return task completion stats + progress data for an agent."""
    if current_user.role == "agent" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Tasks assigned
    assignments = await db.execute(
        select(func.count()).select_from(TaskAssignment).where(TaskAssignment.agent_id == user_id)
    )
    total_assigned = assignments.scalar()

    # Completed
    completions = await db.execute(
        select(func.count()).select_from(TaskCompletion).where(TaskCompletion.agent_id == user_id)
    )
    total_completed = completions.scalar()

    return {
        "user_id": user_id,
        "total_assigned": total_assigned,
        "total_completed": total_completed,
        "completion_rate": round((total_completed / total_assigned * 100) if total_assigned else 0, 1),
    }


@router.put("/me")
async def update_profile(
    req: UpdateUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.full_name is not None:
        current_user.full_name = req.full_name
    if req.region is not None:
        current_user.region = req.region
    if req.linkedin_url is not None:
        current_user.linkedin_url = req.linkedin_url
    if req.avatar_url is not None:
        current_user.avatar_url = req.avatar_url
    await db.commit()
    return _user_dict(current_user)


@router.post("/{user_id}/reset-credentials")
async def reset_credentials(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_password = secrets.token_urlsafe(12)
    user.hashed_password = hash_password(new_password)
    await db.commit()
    return {"email": user.email, "new_password": new_password}


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "region": u.region,
        "linkedin_url": u.linkedin_url,
        "avatar_url": u.avatar_url,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }
