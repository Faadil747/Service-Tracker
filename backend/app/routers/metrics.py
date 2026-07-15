from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import PostMetric, User, FollowerSnapshot
from app.services.auth_service import get_current_user
from app.services.linkedin_service import linkedin_service

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


async def _db_snapshot_fallback(db: AsyncSession) -> Optional[dict]:
    """Last-known company-page KPIs from the persisted daily snapshots. Used when the
    live LinkedIn cache is empty — e.g. after a restart, since the cache lives on the
    (ephemeral) filesystem — so the dashboard keeps showing the real, last-saved
    numbers instead of blanking out. Never fabricated; it's the last real sync."""
    row = (await db.execute(
        select(FollowerSnapshot).order_by(FollowerSnapshot.snapshot_date.desc()).limit(1)
    )).scalar_one_or_none()
    if not row or not row.followers:
        return None
    ts = row.updated_at or row.created_at
    return {
        "followers": row.followers,
        "organic_followers": row.organic_followers,
        "paid_followers": row.paid_followers,
        "impressions": row.impressions,
        "unique_impressions": row.unique_impressions,
        "clicks": row.clicks,
        "likes": row.likes,
        "comments": row.comments,
        "shares": row.shares,
        "visitors": row.visitors,
        "engagement_rate": row.engagement_rate,
        "_meta": {
            "available": True,
            "served_from_cache": True,
            "served_from_db": True,
            "last_updated": ts.isoformat() if ts else None,
            "reason": "LinkedIn API throttled — showing the last saved daily snapshot.",
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Real LinkedIn company-page overview (cached, throttle-aware, real-only)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/linkedin-overview")
async def linkedin_overview(
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The single source of truth for company-page KPIs.

    Returns only real values fetched from LinkedIn. Fields LinkedIn is currently
    throttling are served from the last real snapshot and listed in
    `_meta.stale_fields`; nothing is fabricated. When the live cache is empty
    (e.g. right after a restart), falls back to the last saved DB snapshot.
    """
    snapshot = await linkedin_service.get_org_snapshot(force=force)
    if not snapshot.get("_meta", {}).get("available"):
        fallback = await _db_snapshot_fallback(db)
        if fallback:
            return fallback
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
    db: AsyncSession = Depends(get_db),
):
    """Hero-tile summary derived from the real LinkedIn snapshot (falls back to the
    last saved DB snapshot when the live cache is empty)."""
    snapshot = await linkedin_service.get_org_snapshot()
    if not snapshot.get("_meta", {}).get("available"):
        fallback = await _db_snapshot_fallback(db)
        if fallback:
            snapshot = fallback
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


# ─────────────────────────────────────────────────────────────────────────────
# Follower history — daily snapshots stored in our own DB.
#
# LinkedIn does not expose historical follower data, so we store one row per
# calendar day every time we successfully sync.  This endpoint returns:
#   • `history`      – chronological list of {date, followers} for charting
#   • `daily_delta`  – net change since yesterday (positive = gained, negative = lost)
#   • `weekly_delta` – net change since Monday of the current week
#   • `daily_gained` / `daily_lost` – split view of the daily delta
#   • `has_enough_data` – False when we don't yet have two snapshots to compare
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/follower-history")
async def follower_history(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(FollowerSnapshot)
        .where(FollowerSnapshot.snapshot_date >= since)
        .order_by(FollowerSnapshot.snapshot_date.asc())
    )
    rows = result.scalars().all()

    history = [
        {
            "date": str(r.snapshot_date),
            "followers": r.followers,
            "organic": r.organic_followers,
            "paid": r.paid_followers,
        }
        for r in rows
    ]

    # ── Daily delta (yesterday → today) ──────────────────────────────────────
    today = date.today()
    yesterday = today - timedelta(days=1)

    row_today = next((r for r in rows if r.snapshot_date == today), None)
    row_yesterday = next((r for r in rows if r.snapshot_date == yesterday), None)

    daily_delta: Optional[int] = None
    daily_gained: Optional[int] = None
    daily_lost: Optional[int] = None
    if row_today and row_yesterday:
        daily_delta = row_today.followers - row_yesterday.followers
        daily_gained = max(0, daily_delta)
        daily_lost = abs(min(0, daily_delta))

    # ── Weekly delta (Monday → today) ────────────────────────────────────────
    days_since_monday = today.weekday()           # Monday = 0
    monday = today - timedelta(days=days_since_monday)

    row_monday = next((r for r in rows if r.snapshot_date == monday), None)
    # Fallback: earliest snapshot this week if Monday itself wasn't captured
    if row_monday is None:
        week_rows = [r for r in rows if r.snapshot_date >= monday]
        row_monday = week_rows[0] if week_rows else None

    weekly_delta: Optional[int] = None
    weekly_gained: Optional[int] = None
    weekly_lost: Optional[int] = None
    if row_today and row_monday and row_monday.snapshot_date != row_today.snapshot_date:
        weekly_delta = row_today.followers - row_monday.followers
        weekly_gained = max(0, weekly_delta)
        weekly_lost = abs(min(0, weekly_delta))

    # ── Rolling-window net deltas (1 / 7 / 14 / 30 days) ─────────────────────
    # Each window is the follower change vs the most recent snapshot on-or-before
    # (latest_date − N days). Returns null when we don't yet have a baseline that
    # far back — honest "accumulating" rather than a fabricated number. As daily
    # snapshots pile up, the windows diverge into genuinely distinct figures.
    latest = rows[-1] if rows else None

    def _rolling(n_days: int) -> dict:
        if latest is None:
            return {"delta": None, "gained": None, "lost": None, "pct": None, "days_needed": n_days}
        boundary = latest.snapshot_date - timedelta(days=n_days)
        baseline = None
        for r in rows:  # ascending -> last match is the most recent on/before boundary
            if r.snapshot_date <= boundary:
                baseline = r
        if baseline is None or baseline.snapshot_date == latest.snapshot_date:
            return {"delta": None, "gained": None, "lost": None, "pct": None, "days_needed": n_days}
        delta = latest.followers - baseline.followers
        pct = round(delta / baseline.followers * 100, 2) if baseline.followers else None
        return {"delta": delta, "gained": max(0, delta), "lost": abs(min(0, delta)), "pct": pct, "days_needed": n_days}

    windows = {"d1": _rolling(1), "d7": _rolling(7), "d14": _rolling(14), "d30": _rolling(30)}

    return {
        "history": history,
        "daily_delta": daily_delta,
        "daily_gained": daily_gained,
        "daily_lost": daily_lost,
        "weekly_delta": weekly_delta,
        "weekly_gained": weekly_gained,
        "weekly_lost": weekly_lost,
        "windows": windows,
        "has_enough_data": len(rows) >= 2,
        "snapshot_count": len(rows),
        "today": str(today),
        "monday": str(monday),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Daily metric trend — the real multi-metric history we accumulate ourselves,
# one row per day. LinkedIn exposes no historical API, so this fills in over time
# (sparse at first). Nothing here is estimated or fabricated.
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/daily-trend")
async def daily_trend(
    days: int = 14,
    end: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Real accumulated daily metrics. `days` sets the window length; `end`
    (YYYY-MM-DD) anchors it so you can look back at any historical period we
    have snapshots for. Defaults to the rolling window ending today."""
    days = max(1, min(days, 366))
    try:
        anchor = date.fromisoformat(end) if end else date.today()
    except ValueError:
        anchor = date.today()
    since = anchor - timedelta(days=days)
    result = await db.execute(
        select(FollowerSnapshot)
        .where(FollowerSnapshot.snapshot_date > since, FollowerSnapshot.snapshot_date <= anchor)
        .order_by(FollowerSnapshot.snapshot_date.asc())
    )
    rows = result.scalars().all()
    trend = [
        {
            "date": str(r.snapshot_date),
            "followers": r.followers,
            "impressions": r.impressions or 0,
            "unique_impressions": r.unique_impressions or 0,
            "clicks": r.clicks or 0,
            "reactions": r.likes or 0,
            "comments": r.comments or 0,
            "shares": r.shares or 0,
            "engagement": (r.likes or 0) + (r.comments or 0) + (r.shares or 0),
            "visitors": r.visitors or 0,
            "engagement_rate": r.engagement_rate or 0.0,
        }
        for r in rows
    ]
    return {
        "days": days,
        "snapshot_count": len(rows),
        "trend": trend,
        "has_enough_data": len(rows) >= 2,
    }
