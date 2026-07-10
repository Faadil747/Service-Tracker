"""
Reports — executive analytics aggregated from real project data.

Everything here is derived from what the platform actually knows: the live
LinkedIn snapshot (followers / lifetime engagement), published posts, tasks,
per-post metrics, and the team roster. Nothing is fabricated — sections with no
data return zeros/empties so the UI can render them honestly.
"""
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Post, PostStatus, PostMetric, User
from app.models.task import Task, TaskStatus
from app.services.auth_service import get_current_user
from app.services.linkedin_service import linkedin_service

router = APIRouter(prefix="/api/reports", tags=["reports"])

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "12m": 365, "all": None}


def _window_start(rng: str) -> Optional[datetime]:
    days = _RANGE_DAYS.get(rng)
    return (datetime.utcnow() - timedelta(days=days)) if days else None


async def _latest_metric_by_post(db: AsyncSession) -> dict:
    """Most recent PostMetric row per post (avoids double-counting daily rows)."""
    rows = (await db.execute(select(PostMetric).order_by(PostMetric.metric_date.asc()))).scalars().all()
    latest: dict = {}
    for m in rows:
        latest[m.post_id] = {
            "likes": m.likes or 0,
            "comments": m.comments or 0,
            "shares": m.shares or 0,
            "impressions": m.impressions or 0,
            "clicks": m.clicks or 0,
            "date": m.metric_date,
        }
    return latest


def _eng(m: dict) -> int:
    return (m.get("likes", 0) or 0) + (m.get("comments", 0) or 0) + (m.get("shares", 0) or 0)


def _score(m: dict) -> int:
    # Same weighting the reference leaderboard uses: likes + comments*2 + shares*3.
    return (m.get("likes", 0) or 0) + (m.get("comments", 0) or 0) * 2 + (m.get("shares", 0) or 0) * 3


async def _build_summary(db: AsyncSession, rng: str, region: Optional[str]) -> dict:
    start = _window_start(rng)
    reg = region if (region and region != "Global") else None

    # ── Posts ────────────────────────────────────────────────────────────────
    pq = select(Post)
    if reg:
        pq = pq.where(Post.region == reg)
    posts = (await db.execute(pq)).scalars().all()

    def _post_date(p: Post) -> datetime:
        return p.published_at or p.created_at or datetime.utcnow()

    published = [p for p in posts if p.status == PostStatus.published]
    if start:
        published_win = [p for p in published if _post_date(p) >= start]
    else:
        published_win = published

    # ── Tasks ────────────────────────────────────────────────────────────────
    tq = select(Task)
    if reg:
        tq = tq.where(Task.region == reg)
    tasks = (await db.execute(tq)).scalars().all()
    completed = [t for t in tasks if t.status == TaskStatus.completed]
    in_progress = [t for t in tasks if t.status == TaskStatus.in_progress]
    pending = [t for t in tasks if t.status not in (TaskStatus.completed, TaskStatus.in_progress)]
    task_completion = round(len(completed) / len(tasks) * 100, 1) if tasks else 0.0

    # ── Per-post engagement (from PostMetric) ────────────────────────────────
    metrics = await _latest_metric_by_post(db)
    total_engagements = sum(_eng(metrics.get(p.id, {})) for p in published_win)

    # ── Team roster ──────────────────────────────────────────────────────────
    uq = select(User).where(User.is_active == True, User.role == "agent")
    if reg:
        uq = uq.where(User.region == reg)
    agents = (await db.execute(uq)).scalars().all()
    agent_by_id = {a.id: a for a in agents}

    # ── LinkedIn snapshot (cached; real page KPIs) ───────────────────────────
    snap = await linkedin_service.get_org_snapshot()
    meta = snap.get("_meta", {})
    total_followers = snap.get("followers")

    # ── Engagement trend — REAL last 14 days, from our own daily snapshots ────
    # LinkedIn exposes lifetime totals only, so each day's engagement is the
    # day-over-day increase in the recorded cumulative reactions/comments/shares.
    # Sparse until enough days accumulate — never fabricated.
    now = datetime.utcnow()
    from app.models import FollowerSnapshot
    snap_since = now.date() - timedelta(days=15)
    snap_rows = (await db.execute(
        select(FollowerSnapshot)
        .where(FollowerSnapshot.snapshot_date >= snap_since)
        .order_by(FollowerSnapshot.snapshot_date.asc())
    )).scalars().all()
    trend = []
    prev_cum = None
    for r in snap_rows:
        cum = (r.likes or 0) + (r.comments or 0) + (r.shares or 0)
        daily = 0 if prev_cum is None else max(0, cum - prev_cum)
        prev_cum = cum
        trend.append({"date": str(r.snapshot_date), "day": str(r.snapshot_date)[5:], "engagements": daily})
    trend = trend[-14:]

    # ── Publishing volume — posts per month, current year ────────────────────
    year = now.year
    vol = {mo: 0 for mo in _MONTHS}
    for p in published:
        d = _post_date(p)
        if d.year == year:
            vol[_MONTHS[d.month - 1]] += 1
    publishing_volume = [{"month": mo, "posts": vol[mo]} for mo in _MONTHS]

    # ── Region performance ───────────────────────────────────────────────────
    regions = ["USA", "India", "Indonesia"] if not reg else [reg]
    region_perf = []
    for rname in regions:
        r_agents = [a for a in agents if a.region == rname]
        r_posts = [p for p in published if p.region == rname]
        r_eng = sum(_eng(metrics.get(p.id, {})) for p in r_posts)
        emp = len(r_agents)
        region_perf.append({
            "region": rname,
            "employees": emp,
            "engagements": r_eng,
            "avg": round(r_eng / emp, 1) if emp else 0.0,
        })

    # ── Top performing posts ─────────────────────────────────────────────────
    ranked = sorted(
        published,
        key=lambda p: (_eng(metrics.get(p.id, {})), _post_date(p).timestamp()),
        reverse=True,
    )[:5]
    top_posts = []
    for p in ranked:
        m = metrics.get(p.id, {})
        top_posts.append({
            "id": p.id,
            "content": (p.content or "")[:140],
            "likes": m.get("likes", 0),
            "comments": m.get("comments", 0),
            "shares": m.get("shares", 0),
            "total": _eng(m),
        })

    # ── Employee engagement leaderboard ──────────────────────────────────────
    board = defaultdict(lambda: {"score": 0, "posts": 0})
    for p in published:
        b = board[p.created_by_id]
        b["score"] += _score(metrics.get(p.id, {}))
        b["posts"] += 1
    leaderboard = []
    for uid, b in board.items():
        agent = agent_by_id.get(uid)
        leaderboard.append({
            "agent_id": uid,
            "name": agent.full_name if agent else "Unknown",
            "region": agent.region if agent else "—",
            "score": b["score"],
            "posts": b["posts"],
        })
    leaderboard.sort(key=lambda x: x["score"], reverse=True)
    leaderboard = leaderboard[:10]

    # ── Insights & recommendations (heuristic, from real numbers) ────────────
    weeks_span = max(1, (_RANGE_DAYS.get(rng) or 84) / 7)
    posts_per_week = round(len(published_win) / weeks_span, 1)
    eng_per_post = round(total_engagements / len(published_win), 1) if published_win else 0.0
    insights = []
    if posts_per_week < 4:
        insights.append({
            "type": "posting", "tone": "info",
            "title": "Increase posting frequency",
            "body": f"Currently averaging {posts_per_week} posts/week. Aim for 4–5 for maximum reach.",
        })
    else:
        insights.append({
            "type": "posting", "tone": "good",
            "title": "Healthy posting cadence",
            "body": f"Averaging {posts_per_week} posts/week — keep the momentum.",
        })
    insights.append({
        "type": "engagement", "tone": "good" if eng_per_post >= 20 else "warn",
        "title": "Boost engagement rate" if eng_per_post < 20 else "Strong engagement",
        "body": f"{eng_per_post} engagements per post. Encourage the team to engage within 30 minutes of publishing."
                if eng_per_post < 20 else f"{eng_per_post} engagements per post — above target.",
    })
    if task_completion < 60:
        insights.append({
            "type": "tasks", "tone": "bad",
            "title": "Improve task completion",
            "body": f"Task completion rate is {task_completion}%. Review overdue tasks and reassign if needed.",
        })

    return {
        "range": rng,
        "region": region or "Global",
        "generated_at": now.isoformat(),
        "kpis": {
            "total_followers": total_followers,
            "task_completion": task_completion,
            "total_posts": len(published),
            "total_engagements": total_engagements,
        },
        "engagement_trend": trend,
        "publishing_volume": publishing_volume,
        "task_breakdown": {
            "completed": len(completed),
            "in_progress": len(in_progress),
            "pending": len(pending),
        },
        "region_performance": region_perf,
        "top_posts": top_posts,
        "leaderboard": leaderboard,
        "insights": insights,
        "team_size": len(agents),
        "posts_per_week": posts_per_week,
        "_meta": {
            "linkedin_available": meta.get("available", False),
            "rate_limited": meta.get("rate_limited", False),
            "last_updated": meta.get("last_updated"),
        },
    }


@router.get("/summary")
async def reports_summary(
    range: str = "all",
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full executive report payload for the Reports page. Recomputed on every
    call from live data, so a frontend poll reflects new posts/tasks/clicks."""
    rng = range if range in _RANGE_DAYS else "all"
    return await _build_summary(db, rng, region)


class AskRequest(BaseModel):
    question: str
    range: str = "all"
    region: Optional[str] = None


@router.post("/ask")
async def ask_data(
    req: AskRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ask AI about your data — grounds a DeepSeek answer in the real report
    numbers. Falls back to a computed answer when DeepSeek isn't configured."""
    from app.config import settings

    rng = req.range if req.range in _RANGE_DAYS else "all"
    summary = await _build_summary(db, rng, req.region)
    k = summary["kpis"]
    tb = summary["task_breakdown"]
    context = (
        f"Total followers: {k['total_followers']}. "
        f"Published posts: {k['total_posts']}. "
        f"Total engagements (likes+comments+shares on posts): {k['total_engagements']}. "
        f"Task completion: {k['task_completion']}% "
        f"(completed {tb['completed']}, in progress {tb['in_progress']}, pending {tb['pending']}). "
        f"Team size: {summary['team_size']} agents. "
        f"Average posts/week: {summary['posts_per_week']}. "
        f"Top post engagement: {summary['top_posts'][0]['total'] if summary['top_posts'] else 0}. "
        f"Region performance: "
        + "; ".join(f"{r['region']} {r['employees']} emp / {r['engagements']} eng" for r in summary["region_performance"])
        + "."
    )

    if not settings.DEEPSEEK_API_KEY:
        # Deterministic, honest fallback so the feature works without a key.
        return {
            "answer": (
                f"Based on current data: {k['total_followers'] or 0} followers, "
                f"{k['total_posts']} published posts, {k['total_engagements']} total engagements, "
                f"and {k['task_completion']}% task completion across {summary['team_size']} team members. "
                "Connect DeepSeek in settings for narrative analysis."
            ),
            "source": "computed",
            "context": context,
        }

    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": [
                        {"role": "system", "content": (
                            "You are a LinkedIn analytics assistant for GOrecruitAI. Answer the user's question "
                            "using ONLY the data provided. Be concise (2-4 sentences), specific, and cite the numbers. "
                            "If the data can't answer it, say so plainly."
                        )},
                        {"role": "user", "content": f"DATA:\n{context}\n\nQUESTION: {req.question}"},
                    ],
                    "temperature": 0.4,
                    "max_tokens": 300,
                },
            )
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"].strip()
            return {"answer": answer, "source": "deepseek"}
    except Exception as e:
        return {
            "answer": f"Couldn't reach the AI service ({str(e)[:80]}). Here are the raw figures: {context}",
            "source": "error",
        }
