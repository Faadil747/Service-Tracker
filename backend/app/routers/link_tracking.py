import uuid
import json
import random
import string
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import LinkTracking, User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/links", tags=["link_tracking"])


class CreateLinkRequest(BaseModel):
    original_url: str
    post_id: Optional[str] = None
    utm_source: str = "linkedin"
    utm_medium: str = "social"
    utm_campaign: str = ""
    utm_content: str = ""
    region: str = "Global"


def _generate_short_code(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


@router.post("/shorten", status_code=201)
async def create_link(
    req: CreateLinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a UTM-tagged branded short link."""
    short_code = _generate_short_code()
    # Build full UTM URL
    params = []
    if req.utm_source:
        params.append(f"utm_source={req.utm_source}")
    if req.utm_medium:
        params.append(f"utm_medium={req.utm_medium}")
    if req.utm_campaign:
        params.append(f"utm_campaign={req.utm_campaign}")
    if req.utm_content:
        params.append(f"utm_content={req.utm_content}")
    param_str = "&".join(params)
    full_url = f"{req.original_url}{'?' if '?' not in req.original_url else '&'}{param_str}" if params else req.original_url

    link = LinkTracking(
        id=str(uuid.uuid4()),
        post_id=req.post_id,
        agent_id=current_user.id,
        original_url=req.original_url,
        short_code=short_code,
        short_url=f"https://go.gorecruitai.com/{short_code}",
        utm_source=req.utm_source,
        utm_medium=req.utm_medium,
        utm_campaign=req.utm_campaign,
        utm_content=req.utm_content,
        region=req.region,
        click_data="[]",
    )
    db.add(link)
    await db.commit()
    return _link_dict(link)


@router.get("/")
async def list_links(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(LinkTracking)
    if current_user.role == "agent":
        q = q.where(LinkTracking.agent_id == current_user.id)
    result = await db.execute(q.order_by(LinkTracking.created_at.desc()))
    return [_link_dict(l) for l in result.scalars()]


@router.get("/clicks/summary")
async def clicks_summary(
    region: Optional[str] = None,
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(LinkTracking)
    if region and region != "Global":
        q = q.where(LinkTracking.region == region)
    if current_user.role == "agent":
        q = q.where(LinkTracking.agent_id == current_user.id)
    
    result = await db.execute(q)
    links = result.scalars().all()

    summary = []
    countries = ["USA", "India", "UK", "Canada", "Australia", "Germany"]

    for link in links:
        clicks_data = json.loads(link.click_data or "[]")
        for idx, click in enumerate(clicks_data):
            ts_str = click.get("timestamp", datetime.utcnow().isoformat())
            # Simple pseudo-random country based on IP
            ip_val = click.get("ip", str(idx))
            c_country = countries[hash(ip_val) % len(countries)]
            
            summary.append({
                "clicked_at": ts_str,
                "country": c_country,
                "click_count": 1,
                "unique_count": 1,
                "source": click.get("source", "feed")
            })

    return summary



@router.get("/{short_code}/track")
async def track_click(
    short_code: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Record a click event and redirect (simulate geo/device attribution)."""
    result = await db.execute(select(LinkTracking).where(LinkTracking.short_code == short_code))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Short link not found")

    click_event = {
        "timestamp": datetime.utcnow().isoformat(),
        "ip": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", ""),
        "source": "feed",  # feed/profile/dm/external — can be enriched from referrer
    }
    clicks = json.loads(link.click_data or "[]")
    clicks.append(click_event)
    link.click_data = json.dumps(clicks)
    link.total_clicks += 1
    await db.commit()
    return {"redirect_to": link.original_url, "total_clicks": link.total_clicks}


@router.get("/{link_id}/analytics")
async def link_analytics(
    link_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LinkTracking).where(LinkTracking.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    clicks = json.loads(link.click_data or "[]")
    return {
        **_link_dict(link),
        "click_events": clicks,
        "source_breakdown": {"feed": sum(1 for c in clicks if c.get("source") == "feed"), "profile": 0, "dm": 0, "external": 0},
    }


def _link_dict(l: LinkTracking) -> dict:
    return {
        "id": l.id,
        "post_id": l.post_id,
        "short_code": l.short_code,
        "short_url": l.short_url,
        "original_url": l.original_url,
        "utm_campaign": l.utm_campaign,
        "utm_source": l.utm_source,
        "utm_medium": l.utm_medium,
        "region": l.region,
        "total_clicks": l.total_clicks,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }
