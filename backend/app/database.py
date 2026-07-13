from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

import urllib.parse

if all([settings.DB_SERVER, settings.DB_DATABASE, settings.DB_UID, settings.DB_PWD]):
    # Safely escape ODBC credentials to handle symbols in passwords
    driver_clean = settings.DB_DRIVER.strip("{}")
    conn_str = (
        f"Driver={{{driver_clean}}};"
        f"Server={settings.DB_SERVER};"
        f"Database={settings.DB_DATABASE};"
        f"Uid={settings.DB_UID};"
        f"Pwd={settings.DB_PWD};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
    )
    quoted_conn_str = urllib.parse.quote_plus(conn_str)
    database_url = f"mssql+aioodbc:///?odbc_connect={quoted_conn_str}"
else:
    database_url = settings.DATABASE_URL

engine = create_async_engine(
    database_url,
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        # Import all models to ensure they are registered
        from app.models import user, task, post, metrics, notification, alert, comment, link_tracking  # noqa
        await conn.run_sync(Base.metadata.create_all)
        
        # Automatic gentle schema patch for alerts and tasks/posts relations
        try:
            from sqlalchemy import text
            await conn.execute(text('ALTER TABLE alerts ADD target_user_id VARCHAR(36) NULL'))
            await conn.execute(text('ALTER TABLE alerts ADD resolved_at DATETIME NULL'))
            await conn.execute(text('ALTER TABLE alerts ADD resolved_by_id VARCHAR(36) NULL'))
        except Exception:
            pass

        try:
            from sqlalchemy import text
            await conn.execute(text('ALTER TABLE tasks ADD claimed_by_id VARCHAR(36) NULL'))
        except Exception:
            pass

        try:
            from sqlalchemy import text
            await conn.execute(text('ALTER TABLE posts ADD task_id VARCHAR(36) NULL'))
        except Exception:
            pass

        try:
            from sqlalchemy import text
            await conn.execute(text("ALTER TABLE posts ADD review_comment TEXT DEFAULT ''"))
        except Exception:
            pass

        # Extend the daily snapshot with per-day metric columns so a real
        # multi-metric 14-day trend accumulates. Each ALTER is independent so a
        # partially-migrated DB fills in only the missing columns.
        from sqlalchemy import text as _text
        for _col in (
            "impressions INTEGER DEFAULT 0",
            "unique_impressions INTEGER DEFAULT 0",
            "clicks INTEGER DEFAULT 0",
            "likes INTEGER DEFAULT 0",
            "comments INTEGER DEFAULT 0",
            "shares INTEGER DEFAULT 0",
            "visitors INTEGER DEFAULT 0",
            "engagement_rate FLOAT DEFAULT 0",
        ):
            try:
                await conn.execute(_text(f"ALTER TABLE follower_snapshots ADD {_col}"))
            except Exception:
                pass

        # Task Workspace / AI Composer columns (from the tasks + composer feature set).
        # Each ALTER is independent so a partially-migrated DB fills only what's missing.
        for _stmt in (
            "ALTER TABLE posts ADD employee_engagement TEXT DEFAULT '{}'",
            "ALTER TABLE posts ADD priority VARCHAR(20) DEFAULT 'medium'",
            "ALTER TABLE tasks ADD priority VARCHAR(20) DEFAULT 'medium'",
            "ALTER TABLE tasks ADD recurrence_end_date DATETIME NULL",
        ):
            try:
                await conn.execute(_text(_stmt))
            except Exception:
                pass
