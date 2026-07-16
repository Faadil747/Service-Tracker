import os
import asyncio
from datetime import date
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
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
        retry_secs = 3600  # re-check hourly once today's snapshot is safely recorded
        try:
            if settings.LINKEDIN_AUTO_DAILY_SYNC and linkedin_service._has_credentials():
                if not await _snapshot_exists_today():
                    print("[daily-sync] recording today's LinkedIn snapshot (1 API call)")
                    await linkedin_service.get_org_snapshot(force=True)
                    # If it still didn't land (throttled/transient), retry in a few
                    # minutes instead of losing the whole day to the hourly cadence.
                    if not await _snapshot_exists_today():
                        retry_secs = 300
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[daily-sync] error (will retry soon): {e}")
            retry_secs = 300
        await asyncio.sleep(retry_secs)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables + launch the once-a-day snapshot scheduler.
    await init_db()

    # Bootstrap the first admin from env vars (works on hosts without shell access,
    # e.g. Render free tier). Creates the admin if missing; also resets its password
    # when ADMIN_RESET=true, so you can recover a forgotten login without a shell.
    try:
        import uuid as _uuid
        from sqlalchemy import select
        from app.database import AsyncSessionLocal
        from app.models import User
        from app.services.auth_service import hash_password
        from app.config import settings as _settings
        # Read from settings so it works both locally (.env via pydantic) and in
        # production (real env vars). os.getenv alone doesn't see the local .env.
        _admin_email = (_settings.ADMIN_EMAIL or os.getenv("ADMIN_EMAIL", "")).strip().lower()
        _admin_pw = (_settings.ADMIN_PASSWORD or os.getenv("ADMIN_PASSWORD", "")).strip()
        _admin_reset = bool(_settings.ADMIN_RESET) or os.getenv("ADMIN_RESET", "").strip().lower() in ("1", "true", "yes")
        if _admin_email and _admin_pw:
            async with AsyncSessionLocal() as _db:
                _existing = (await _db.execute(select(User).where(User.email == _admin_email))).scalar_one_or_none()
                if _existing is None:
                    _db.add(User(
                        id=str(_uuid.uuid4()), email=_admin_email,
                        full_name=(_settings.ADMIN_NAME or "Administrator").strip() or "Administrator",
                        hashed_password=hash_password(_admin_pw), role="admin", region="Global", is_active=True,
                    ))
                    await _db.commit()
                    print(f"Bootstrapped admin: {_admin_email}")
                elif _admin_reset:
                    _existing.hashed_password = hash_password(_admin_pw)
                    _existing.role = "admin"
                    _existing.is_active = True
                    await _db.commit()
                    print(f"Reset admin password: {_admin_email}")
    except Exception as e:
        print(f"Admin bootstrap skipped: {e}")

    # Apply any admin-saved API keys (from the Settings UI) onto the live config.
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import load_api_configs_into_settings
        async with AsyncSessionLocal() as _db:
            await load_api_configs_into_settings(_db)
    except Exception as e:
        print(f"API config load skipped: {e}")

    # Seed the in-memory LinkedIn snapshot from the durable DB so the dashboard
    # and Detailed Analytics show real data immediately after a cold restart
    # (Render's ephemeral disk wipes the on-disk cache), instead of going blank
    # until the next throttle-limited live sync.
    try:
        from app.services.linkedin_service import seed_snapshot_from_db
        await seed_snapshot_from_db()
    except Exception as e:
        print(f"LinkedIn snapshot seed skipped: {e}")

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

# Allowed browser origins: the configured frontend + any extras from ALLOWED_ORIGINS
# (comma-separated) + local dev ports. The regex additionally covers Vercel preview
# deploys (https://<project>-<hash>.vercel.app) without listing each one.
_cors_origins = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
]
_cors_origins += [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
_cors_origins = sorted(set(o for o in _cors_origins if o))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
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


@app.get("/health")
async def health():
    return {"status": "healthy"}


# ── Optional single-process hosting ──────────────────────────────────────────
# If a built frontend is present at backend/static, THIS process serves the SPA
# AND the API on one port — no separate web server, CORS, or domain needed (used
# for the self-hosted Windows/VPS deploy). When the folder is absent (Render), the
# API keeps its plain JSON root and nothing else changes.
_FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
_FRONTEND_INDEX = os.path.join(_FRONTEND_DIR, "index.html")

if os.path.isfile(_FRONTEND_INDEX):
    from fastapi.responses import FileResponse

    @app.get("/", include_in_schema=False)
    async def _spa_root():
        return FileResponse(_FRONTEND_INDEX)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa(full_path: str):
        # Only unmatched GETs reach here (API routers, /uploads, /docs match first).
        if full_path.startswith(("api/", "uploads/")):
            raise HTTPException(status_code=404)
        candidate = os.path.normpath(os.path.join(_FRONTEND_DIR, full_path))
        if candidate.startswith(_FRONTEND_DIR) and os.path.isfile(candidate):
            return FileResponse(candidate)               # real asset (js/css/img)
        return FileResponse(_FRONTEND_INDEX)             # SPA deep-link fallback
else:
    @app.get("/")
    async def root():
        return {"name": "Service Tracker API", "version": "1.0.0", "status": "running"}
