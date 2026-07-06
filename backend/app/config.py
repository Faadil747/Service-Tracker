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

    # AI — DeepSeek
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"  # one-line config swap
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # LinkedIn OAuth
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/auth/linkedin/callback"
    LINKEDIN_ORG_ID: str = ""

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

    # Feature flags
    DEV_MODE: bool = True  # enables sandbox / mock data endpoints

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
