import os
import asyncio
from datetime import date
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import init_db
from app.routers import auth, users, tasks, posts, ai, notifications, alerts, metrics, link_tracking, reports, settings as settings_router


async def _snapshot_exists_today() -> bool:
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models import FollowerSnapshot
    async with AsyncSessionLocal() as s:
        row = (await s.execute(
            select(FollowerSnapshot).where(FollowerSnapshot.snapshot_date == date.today())
        )).scalar_one_or_none()
        return row is not None


async def _daily_sync_loop():
    """Record exactly ONE real LinkedIn snapshot per calendar day so the rolling
    14-day trends fill in automatically. Quota-safe: it re-checks hourly but only
    calls LinkedIn on the first check of a day that has no snapshot yet — so at
    most one API call/day, and never twice even across restarts. Any error is
    swallowed so the loop keeps running."""
    from app.services.linkedin_service import linkedin_service
    await asyncio.sleep(5)  # let startup settle
    while True:
        try:
            if settings.LINKEDIN_AUTO_DAILY_SYNC and linkedin_service._has_credentials():
                if not await _snapshot_exists_today():
                    print("[daily-sync] recording today's LinkedIn snapshot (1 API call)")
                    await linkedin_service.get_org_snapshot(force=True)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[daily-sync] error (will retry next hour): {e}")
        await asyncio.sleep(3600)  # re-check hourly; real fetch happens once/day


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables + launch the once-a-day snapshot scheduler.
    await init_db()
    # Apply any admin-saved API keys (from the Settings UI) onto the live config.
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import load_api_configs_into_settings
        async with AsyncSessionLocal() as _db:
            await load_api_configs_into_settings(_db)
    except Exception as e:
        print(f"API config load skipped: {e}")
    sync_task = asyncio.create_task(_daily_sync_loop())
    try:
        yield
    finally:
        # Shutdown: stop the scheduler cleanly.
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Service Tracker API",
    description="GOrecruitAI LinkedIn Management Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL, 
        "http://localhost:5173", 
        "http://localhost:5174", 
        "http://localhost:5175", 
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tasks.router)
app.include_router(posts.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(alerts.router)
app.include_router(metrics.router)
app.include_router(link_tracking.router)
app.include_router(reports.router)
app.include_router(settings_router.router)

# Serve uploaded post images from backend/uploads at /uploads/<file>
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
async def root():
    return {"name": "Service Tracker API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
