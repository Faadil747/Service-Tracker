from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Service Tracker"
    SECRET_KEY: str = "change-me-in-production-super-secret-key-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # Database — default to SQLite for local dev; set to mssql+pyodbc://... for production
    DATABASE_URL: str = "sqlite+aiosqlite:///./service_tracker.db"

    # MS SQL Server (Production)
    DB_SERVER: Optional[str] = None
    DB_DATABASE: Optional[str] = None
    DB_UID: Optional[str] = None
    DB_PWD: Optional[str] = None
    DB_DRIVER: Optional[str] = "ODBC Driver 18 for SQL Server"

    # AI — DeepSeek
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"  # one-line config swap
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # LinkedIn OAuth
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/auth/linkedin/callback"
    LINKEDIN_ORG_ID: str = ""

    # LinkedIn long-lived access token (used for publishing + metrics)
    LINKEDIN_ACCESS_TOKEN: str = ""

    # LinkedIn refresh token — when present the service auto-renews the access
    # token on expiry (HTTP 401) instead of going dark. Requires the app to be
    # approved for refresh tokens. Get one via the OAuth flow with r_ scopes.
    LINKEDIN_REFRESH_TOKEN: str = ""

    # Minutes between live LinkedIn analytics fetches. LinkedIn day-throttles the
    # follower/page statistics endpoints, so we cache each real snapshot and only
    # re-fetch after this interval. Frontend polls read the cached snapshot.
    LINKEDIN_SYNC_INTERVAL_MIN: int = 30

    # Record exactly one real LinkedIn snapshot per calendar day (1 API call/day)
    # so the rolling 14-day trends fill in automatically. Set False to make the
    # integration fully manual (only the Sync button ever calls LinkedIn).
    LINKEDIN_AUTO_DAILY_SYNC: bool = True

    # LinkedIn proxy (configurable for dev/test role)
    LINKEDIN_PROXY_URL: str = "http://localhost:3001"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # SMTP (for email-agent feature)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@gorecruitai.com"

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"

    # Public base URL of THIS backend — used to build shareable tracking links
    # (e.g. UTM short links on published posts) that resolve back to the click
    # tracker. Set to the deployed API domain in production.
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"

    # Feature flags
    DEV_MODE: bool = True  # enables sandbox / mock data endpoints

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
