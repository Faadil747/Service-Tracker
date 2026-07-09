from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
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
