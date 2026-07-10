from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import ApiConfig, User
from app.services.auth_service import get_current_user, require_role
from app.config import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])
require_admin = require_role("admin")

# String settings an admin may manage from the UI. Saving one persists it to the
# ApiConfig table AND applies it to the live `settings` object, so integrations can
# be (re)configured without editing the server's .env.
MANAGEABLE_KEYS = {
    "LINKEDIN_ACCESS_TOKEN",
    "LINKEDIN_ORG_ID",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "LINKEDIN_REFRESH_TOKEN",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "DEEPSEEK_BASE_URL",
}


async def load_api_configs_into_settings(db: AsyncSession):
    """Apply admin-saved API keys (persisted in ApiConfig) onto the live settings
    object at startup, so UI-managed keys survive restarts and override .env."""
    result = await db.execute(select(ApiConfig))
    for c in result.scalars().all():
        if c.key_name in MANAGEABLE_KEYS and c.value_encrypted:
            setattr(settings, c.key_name, c.value_encrypted)


class UpdateProxyRequest(BaseModel):
    proxy_url: str


class ApiConfigRequest(BaseModel):
    key_name: str
    value: str
    description: str = ""


@router.get("/")
async def get_settings(current_user: User = Depends(get_current_user)):
    return {
        "linkedin_proxy_url": settings.LINKEDIN_PROXY_URL,
        "deepseek_model": settings.DEEPSEEK_MODEL,
        "deepseek_base_url": settings.DEEPSEEK_BASE_URL,
        "dev_mode": settings.DEV_MODE,
        "deepseek_key_set": bool(settings.DEEPSEEK_API_KEY),
        "linkedin_client_id_set": bool(settings.LINKEDIN_CLIENT_ID),
        "linkedin_access_token_set": bool(settings.LINKEDIN_ACCESS_TOKEN),
        "linkedin_org_id": settings.LINKEDIN_ORG_ID,
        # Which manageable keys currently hold a value (never returns the secrets).
        "configured": {k: bool(getattr(settings, k, "")) for k in MANAGEABLE_KEYS},
    }


@router.get("/linkedin-status")
async def linkedin_connection_status(current_user: User = Depends(get_current_user)):
    """Test the LinkedIn access token and return connection health details."""
    from app.services.linkedin_service import linkedin_service
    result = await linkedin_service.test_connection()
    return result


@router.get("/deepseek-status")
async def deepseek_connection_status(current_user: User = Depends(get_current_user)):
    """Test the DeepSeek API key with a minimal completion call."""
    if not settings.DEEPSEEK_API_KEY:
        return {"connected": False, "error": "No DeepSeek API key configured"}
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": [{"role": "user", "content": "Ping"}],
                    "max_tokens": 5,
                },
            )
            if resp.status_code == 200:
                return {
                    "connected": True,
                    "model": settings.DEEPSEEK_MODEL,
                    "base_url": settings.DEEPSEEK_BASE_URL,
                }
            else:
                return {
                    "connected": False,
                    "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
                }
    except Exception as e:
        return {"connected": False, "error": str(e)}


@router.get("/api-config")
async def list_api_configs(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ApiConfig))
    configs = result.scalars().all()
    return [
        {
            "id": c.id,
            "key_name": c.key_name,
            "description": c.description,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in configs
    ]


@router.post("/api-config")
async def upsert_api_config(
    req: ApiConfigRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    if req.key_name not in MANAGEABLE_KEYS:
        raise HTTPException(status_code=400, detail=f"'{req.key_name}' is not a manageable setting.")
    result = await db.execute(select(ApiConfig).where(ApiConfig.key_name == req.key_name))
    config = result.scalar_one_or_none()
    if config:
        config.value_encrypted = req.value
        config.description = req.description
        config.updated_by_id = current_user.id
    else:
        config = ApiConfig(
            id=str(uuid.uuid4()),
            key_name=req.key_name,
            value_encrypted=req.value,
            description=req.description,
            updated_by_id=current_user.id,
        )
        db.add(config)
    await db.commit()
    # Apply immediately to the live settings so the change takes effect without a restart.
    setattr(settings, req.key_name, req.value)
    return {"key_name": config.key_name, "message": "Saved"}
