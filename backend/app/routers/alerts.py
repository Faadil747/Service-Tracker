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
    target_user_id: Optional[str] = None


@router.get("/")
async def list_alerts(
    status: Optional[str] = None,
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert)
    
    # agents should only see alerts that are either global (without target_user_id) or assigned specifically to them
    if current_user.role == "agent":
        from sqlalchemy import or_
        q = q.where(or_(
            Alert.target_user_id == current_user.id,
            Alert.target_user_id == "all",
            Alert.raised_by_id == current_user.id
        ))

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
    # Agents can raise alerts going to admin only. Admin can raise alert to all or agent-specific.
    target_id = req.target_user_id
    if current_user.role == "agent":
        target_id = "admin"
    elif not target_id:
        target_id = "all"
        
    alert = Alert(
        id=str(uuid.uuid4()),
        raised_by_id=current_user.id,
        title=req.title,
        body=req.body,
        priority=req.priority,
        region=req.region,
        reference_id=req.reference_id,
        reference_type=req.reference_type,
        target_user_id=target_id,
    )
    db.add(alert)
    await db.flush()

    # Notify targets
    if target_id and target_id not in ["all", "admin"]:
        db.add(Notification(
            id=str(uuid.uuid4()),
            user_id=target_id,
            type="alert",
            title=f"🚨 Alert: {req.title}",
            body=req.body,
            reference_id=alert.id,
            reference_type="alert",
        ))
    else:
        # if no specific target, it's global to all admins if raised by agent, or all agents if raised by admin
        if target_id == "admin":
            admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
            for admin in admins.scalars():
                db.add(Notification(
                    id=str(uuid.uuid4()),
                    user_id=admin.id,
                    type="alert",
                    title=f"🚨 Alert from Agent: {req.title}",
                    body=req.body,
                    reference_id=alert.id,
                    reference_type="alert",
                ))
        elif target_id == "all":
            # admin raised to all agents? We could notify everyone, or just admins.
            # let's notify everyone in the region or global
            users_res = await db.execute(select(User).where(User.is_active == True))
            for u in users_res.scalars():
                if u.id != current_user.id:
                    db.add(Notification(
                        id=str(uuid.uuid4()),
                        user_id=u.id,
                        type="alert",
                        title=f"🚨 Global Alert: {req.title}",
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
    
    # mark related notifications as read
    notif_res = await db.execute(select(Notification).where(Notification.reference_type == 'alert', Notification.reference_id == alert_id))
    for n in notif_res.scalars():
        n.is_read = True

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
        "target_user_id": a.target_user_id,
        "reference_id": a.reference_id,
        "reference_type": a.reference_type,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }
