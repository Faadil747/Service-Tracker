import uuid
import json
from datetime import datetime, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models import PageMetric, PostMetric, AudienceDemographic, User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/page")
async def page_metrics(
    region: Optional[str] = None,
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Follower growth, visitors, engagement over time."""
    cutoff = date.today() - timedelta(days=days)
    q = select(PageMetric).where(PageMetric.metric_date >= cutoff)
    if region and region != "Global":
        q = q.where(PageMetric.region == region)
    q = q.order_by(PageMetric.metric_date)
    result = await db.execute(q)
    metrics = result.scalars().all()
    return [_metric_dict(m) for m in metrics]


@router.get("/posts")
async def post_metrics_list(
    post_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(PostMetric)
    if post_id:
        q = q.where(PostMetric.post_id == post_id)
    q = q.order_by(PostMetric.metric_date.desc()).limit(100)
    result = await db.execute(q)
    return [_post_metric_dict(m) for m in result.scalars()]


@router.get("/demographics")
async def demographics(
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(AudienceDemographic)
    if region and region != "Global":
        q = q.where(AudienceDemographic.region == region)
    result = await db.execute(q.order_by(AudienceDemographic.snapshot_date.desc()).limit(200))
    return [_demo_dict(d) for d in result.scalars()]


@router.get("/best-time")
async def best_time_to_post(
    region: str = "Global",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a 7x24 engagement heatmap matrix (day × hour) for the region."""
    # Stub heatmap — real impl aggregates PostMetric by publish hour/day
    import random
    random.seed(hash(region) % 9999)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    # Peak hours: 9-11am and 5-7pm on weekdays for USA/India
    heatmap = []
    for d_idx, day in enumerate(days):
        for hour in range(24):
            is_peak = (d_idx < 5) and (9 <= hour <= 11 or 17 <= hour <= 19)
            base = random.randint(40, 80) if is_peak else random.randint(5, 35)
            heatmap.append({"day": day, "hour": hour, "engagement": base})
    return {"region": region, "heatmap": heatmap}


@router.get("/dashboard-summary")
async def dashboard_summary(
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hero tile summary stats for the dashboard."""
    cutoff = date.today() - timedelta(days=7)
    q = select(PageMetric).where(PageMetric.metric_date >= cutoff)
    if region and region != "Global":
        q = q.where(PageMetric.region == region)
    result = await db.execute(q)
    metrics = result.scalars().all()

    if not metrics:
        return {"total_followers": 0, "weekly_growth": 0, "avg_engagement_rate": 0, "sparkline": []}

    total_followers = max((m.followers for m in metrics), default=0)
    weekly_growth = sum(m.followers_gained - m.followers_lost for m in metrics)
    avg_er = round(sum(m.engagement_rate for m in metrics) / len(metrics) if metrics else 0, 2)
    sparkline = [{"date": str(m.metric_date), "value": m.followers} for m in sorted(metrics, key=lambda x: x.metric_date)]

    return {
        "total_followers": total_followers,
        "weekly_growth": weekly_growth,
        "avg_engagement_rate": avg_er,
        "sparkline": sparkline,
    }


def _metric_dict(m: PageMetric) -> dict:
    return {
        "id": m.id,
        "metric_date": str(m.metric_date),
        "region": m.region,
        "followers": m.followers,
        "followers_gained": m.followers_gained,
        "followers_lost": m.followers_lost,
        "visitors": m.visitors,
        "impressions": m.impressions,
        "likes": m.likes,
        "comments": m.comments,
        "shares": m.shares,
        "clicks": m.clicks,
        "engagement_rate": m.engagement_rate,
    }


def _post_metric_dict(m: PostMetric) -> dict:
    return {
        "id": m.id,
        "post_id": m.post_id,
        "metric_date": str(m.metric_date),
        "impressions": m.impressions,
        "likes": m.likes,
        "comments": m.comments,
        "shares": m.shares,
        "clicks": m.clicks,
        "engagement_velocity": m.engagement_velocity,
        "sentiment_score": m.sentiment_score,
    }


def _demo_dict(d: AudienceDemographic) -> dict:
    return {
        "id": d.id,
        "region": d.region,
        "country": d.country,
        "seniority": d.seniority,
        "industry": d.industry,
        "function": d.function,
        "company_size": d.company_size,
        "follower_count": d.follower_count,
    }
