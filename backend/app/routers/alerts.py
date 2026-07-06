import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import Alert, Notification, User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class CreateAlertRequest(BaseModel):
    title: str
    body: str = ""
    priority: str = "high"  # high / critical
    region: str = "Global"
    reference_id: str = ""
    reference_type: str = ""


@router.get("/")
async def list_alerts(
    status: Optional[str] = None,
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert)
    if status:
        q = q.where(Alert.status == status)
    if region and region != "Global":
        q = q.where(Alert.region == region)
    q = q.order_by(Alert.created_at.desc())
    result = await db.execute(q)
    return [_alert_dict(a) for a in result.scalars()]


@router.post("/", status_code=201)
async def create_alert(
    req: CreateAlertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = Alert(
        id=str(uuid.uuid4()),
        raised_by_id=current_user.id,
        title=req.title,
        body=req.body,
        priority=req.priority,
        region=req.region,
        reference_id=req.reference_id,
        reference_type=req.reference_type,
    )
    db.add(alert)
    await db.flush()

    # Notify all admins
    admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
    for admin in admins.scalars():
        db.add(Notification(
            id=str(uuid.uuid4()),
            user_id=admin.id,
            type="alert",
            title=f"🚨 Alert: {req.title}",
            body=req.body,
            reference_id=alert.id,
            reference_type="alert",
        ))
    await db.commit()
    return _alert_dict(alert)


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "developer":
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    alert.resolved_at = datetime.utcnow()
    alert.resolved_by_id = current_user.id
    await db.commit()
    return _alert_dict(alert)


def _alert_dict(a: Alert) -> dict:
    return {
        "id": a.id,
        "raised_by_id": a.raised_by_id,
        "title": a.title,
        "body": a.body,
        "priority": a.priority,
        "status": a.status,
        "region": a.region,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }
