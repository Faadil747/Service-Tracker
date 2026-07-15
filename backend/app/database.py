from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.compiler import compiles
from sqlalchemy import String as _SAString, Text as _SAText
from app.config import settings


# On MS SQL Server, render string columns as NVARCHAR (unicode) instead of the
# default VARCHAR (non-unicode) so emojis and international text are preserved.
# These hooks only fire for the "mssql" dialect — no effect on SQLite/MySQL/Postgres.
@compiles(_SAString, "mssql")
def _mssql_nvarchar(element, compiler, **kw):
    return f"NVARCHAR({element.length})" if element.length else "NVARCHAR(max)"


@compiles(_SAText, "mssql")
def _mssql_ntext(element, compiler, **kw):
    return "NVARCHAR(max)"

import urllib.parse
import ssl

if all([settings.DB_SERVER, settings.DB_DATABASE, settings.DB_UID, settings.DB_PWD]):
    # Safely escape ODBC credentials to handle symbols in passwords
    driver_clean = settings.DB_DRIVER.strip("{}")
    encrypt_val = "yes" if settings.DB_ENCRYPT else "no"
    conn_str = (
        f"Driver={{{driver_clean}}};"
        f"Server={settings.DB_SERVER};"
        f"Database={settings.DB_DATABASE};"
        f"Uid={settings.DB_UID};"
        f"Pwd={settings.DB_PWD};"
        f"Encrypt={encrypt_val};"
        "TrustServerCertificate=yes;"
    )
    quoted_conn_str = urllib.parse.quote_plus(conn_str)
    _db_url = f"mssql+aioodbc:///?odbc_connect={quoted_conn_str}"
else:
    _db_url = settings.DATABASE_URL

_engine_kwargs = {"echo": False, "future": True}
_connect_args: dict = {}

# Managed databases (MySQL/Postgres/MS SQL) close idle connections; pre-ping + recycle keep
# the pool healthy. SQLite (local dev) needs none of this.
if not _db_url.startswith("sqlite"):
    _engine_kwargs.update(pool_pre_ping=True, pool_recycle=280)
    # Some managed hosts (Aiven, TiDB Cloud, PlanetScale) require TLS. Build a context
    # the async driver (asyncmy / asyncpg) accepts via connect_args["ssl"].
    if settings.DB_SSL and (_db_url.startswith("mysql") or _db_url.startswith("postgresql")):
        _ssl_ctx = ssl.create_default_context()
        if settings.DB_SSL_CA:
            # Full verification against the host's CA certificate.
            _ssl_ctx.load_verify_locations(settings.DB_SSL_CA)
        else:
            # Encrypt without verifying the server cert (matches "ssl-mode=REQUIRED"),
            # so managed hosts with their own CA connect without shipping the CA file.
            _ssl_ctx.check_hostname = False
            _ssl_ctx.verify_mode = ssl.CERT_NONE
        _connect_args["ssl"] = _ssl_ctx
else:
    # Local SQLite: bound the lock wait. If several dev processes touch the same DB
    # file (e.g. leftover `--reload` servers), they contend on SQLite's single write
    # lock; without a bound, a request can block indefinitely and the server appears
    # hung (pages never load). 30s wait, then a clear error instead of a freeze.
    _connect_args["timeout"] = 30

engine = create_async_engine(_db_url, connect_args=_connect_args, **_engine_kwargs)

if _db_url.startswith("sqlite"):
    # WAL lets readers run concurrently with the single writer (far less lock
    # contention than the default rollback journal); busy_timeout caps any lock
    # wait so a busy DB errors fast instead of hanging the request forever.
    from sqlalchemy import event as _sa_event

    @_sa_event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _rec):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()

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
    """Create all tables on startup.

    `create_all` builds the full, current schema from the models — so a freshly
    provisioned managed database (MS SQL / MySQL / Postgres) gets every column and
    needs nothing else. The raw ALTER statements below only exist to migrate older
    *SQLite* dev databases in place, and are skipped everywhere else. This matters
    for MS SQL especially: a failed statement can doom the surrounding transaction,
    so we never run these idempotent-by-failure ALTERs there."""
    async with engine.begin() as conn:
        # Import all models so every table is registered before create_all.
        from app.models import user, task, post, metrics, notification, alert, comment, link_tracking  # noqa
        await conn.run_sync(Base.metadata.create_all)

        # Managed DBs are provisioned fresh — create_all already did everything.
        if not _db_url.startswith("sqlite"):
            return

        # Legacy in-place patches for older SQLite dev DBs (each is safe to fail if
        # the column already exists). Every column here is also defined on a model,
        # so create_all covers fresh databases without any of these.
        from sqlalchemy import text
        legacy_alters = [
            "ALTER TABLE alerts ADD target_user_id VARCHAR(36) NULL",
            "ALTER TABLE alerts ADD resolved_at DATETIME NULL",
            "ALTER TABLE alerts ADD resolved_by_id VARCHAR(36) NULL",
            "ALTER TABLE tasks ADD claimed_by_id VARCHAR(36) NULL",
            "ALTER TABLE posts ADD task_id VARCHAR(36) NULL",
            "ALTER TABLE posts ADD review_comment TEXT DEFAULT ''",
            "ALTER TABLE follower_snapshots ADD impressions INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD unique_impressions INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD clicks INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD likes INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD comments INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD shares INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD visitors INTEGER DEFAULT 0",
            "ALTER TABLE follower_snapshots ADD engagement_rate FLOAT DEFAULT 0",
            "ALTER TABLE posts ADD employee_engagement TEXT DEFAULT '{}'",
            "ALTER TABLE posts ADD priority VARCHAR(20) DEFAULT 'medium'",
            "ALTER TABLE tasks ADD priority VARCHAR(20) DEFAULT 'medium'",
            "ALTER TABLE tasks ADD recurrence_end_date DATETIME NULL",
        ]
        for _stmt in legacy_alters:
            try:
                await conn.execute(text(_stmt))
            except Exception:
                pass
