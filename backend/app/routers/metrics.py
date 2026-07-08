from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import PostMetric, User
from app.services.auth_service import get_current_user
from app.services.linkedin_service import linkedin_service

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


# ─────────────────────────────────────────────────────────────────────────────
# Real LinkedIn company-page overview (cached, throttle-aware, real-only)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/linkedin-overview")
async def linkedin_overview(
    force: bool = False,
    current_user: User = Depends(get_current_user),
):
    """The single source of truth for company-page KPIs.

    Returns only real values fetched from LinkedIn. Fields LinkedIn is currently
    throttling are served from the last real snapshot and listed in
    `_meta.stale_fields`; nothing is fabricated.
    """
    snapshot = await linkedin_service.get_org_snapshot(force=force)
    return snapshot


@router.get("/linkedin-posts")
async def linkedin_posts(
    count: int = 20,
    current_user: User = Depends(get_current_user),
):
    """Recent real posts published on the company page (content + link only)."""
    return await linkedin_service.get_org_posts(count=count)


@router.post("/sync-page")
async def sync_page_metrics(
    current_user: User = Depends(get_current_user),
):
    """Force an immediate live refresh of the LinkedIn snapshot (bypasses cache)."""
    if not (linkedin_service._has_credentials()):
        return {"synced": False, "message": "LinkedIn access token or org ID not configured"}
    snapshot = await linkedin_service.get_org_snapshot(force=True)
    meta = snapshot.get("_meta", {})
    return {
        "synced": meta.get("available", False),
        "rate_limited": meta.get("rate_limited", False),
        "stale_fields": meta.get("stale_fields", []),
        "last_updated": meta.get("last_updated"),
        "followers": snapshot.get("followers"),
        "impressions": snapshot.get("impressions"),
    }


@router.get("/dashboard-summary")
async def dashboard_summary(
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Hero-tile summary derived from the real LinkedIn snapshot."""
    snapshot = await linkedin_service.get_org_snapshot()
    meta = snapshot.get("_meta", {})
    return {
        "total_followers": snapshot.get("followers"),
        "organic_followers": snapshot.get("organic_followers"),
        "paid_followers": snapshot.get("paid_followers"),
        "impressions": snapshot.get("impressions"),
        "unique_impressions": snapshot.get("unique_impressions"),
        "clicks": snapshot.get("clicks"),
        "likes": snapshot.get("likes"),
        "comments": snapshot.get("comments"),
        "shares": snapshot.get("shares"),
        "visitors": snapshot.get("visitors"),
        "avg_engagement_rate": snapshot.get("engagement_rate"),
        "_meta": meta,
    }


@router.get("/demographics")
async def demographics(
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Real follower demographics (only categories resolvable to labels offline)."""
    snapshot = await linkedin_service.get_org_snapshot()
    demo = snapshot.get("demographics") or {}
    return {
        "seniority": demo.get("seniority", []),
        "function": demo.get("function", []),
        "_meta": snapshot.get("_meta", {}),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Per-post metrics — the DB store. LinkedIn will not expose per-post
# likes/comments to this token (socialActions → HTTP 403), so this only ever
# returns rows we actually have; it is never populated with fabricated numbers.
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# Deprecated time-series endpoints. LinkedIn does not expose day-by-day history
# to this token/API version, so these return empty rather than fabricated data.
# Kept for backward compatibility with views that still call them.
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/page")
async def page_metrics(
    region: Optional[str] = None,
    days: int = 30,
    current_user: User = Depends(get_current_user),
):
    """Deprecated: daily follower/visitor history is unavailable via the LinkedIn
    API. Use /linkedin-overview for real current totals."""
    return []


@router.get("/best-time")
async def best_time_to_post(
    region: str = "Global",
    current_user: User = Depends(get_current_user),
):
    """Best-time-to-post heatmap requires per-post hourly engagement, which this
    token cannot access. Returns empty instead of a randomly-generated heatmap."""
    return {"region": region, "heatmap": [], "available": False}
