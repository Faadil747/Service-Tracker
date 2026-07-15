"""Verify the database connection and create all tables.

Run this ON the machine that will host the backend (the one that can reach the DB):

    python -m app.seed.check_db

It prints the target database, tries to connect, then runs create_all so every
table exists. Use it to confirm connectivity + initialize a fresh database
(e.g. the MS SQL 'LinkedInTest' DB) before starting the app.
"""
import asyncio
import re

from sqlalchemy import text

from app.config import settings
from app.database import engine, init_db


def _masked_url() -> str:
    # Hide the password when printing the connection string.
    return re.sub(r"(://[^:/@]+:)([^@]+)(@)", r"\1****\3", settings.DATABASE_URL)


async def main():
    print(f"→ Target database: {_masked_url()}")
    print(f"→ Dialect: {engine.dialect.name}")

    # 1. Can we connect at all?
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print("✅ Connection OK")
    except Exception as e:
        print("❌ Could NOT connect to the database.")
        print(f"   {type(e).__name__}: {e}")
        print("   → Check the host is reachable from THIS machine, the credentials,")
        print("     and (MS SQL) that the ODBC Driver 17 is installed.")
        raise SystemExit(1)

    # 2. Create every table (idempotent).
    try:
        await init_db()
        print("✅ Tables created / verified (create_all).")
    except Exception as e:
        print("❌ Table creation failed.")
        print(f"   {type(e).__name__}: {e}")
        raise SystemExit(1)

    # 3. List the tables we now have.
    try:
        async with engine.connect() as conn:
            def _names(sync_conn):
                from sqlalchemy import inspect
                return sorted(inspect(sync_conn).get_table_names())
            tables = await conn.run_sync(_names)
        print(f"✅ {len(tables)} tables present: {', '.join(tables)}")
    except Exception as e:
        print(f"(could not list tables: {e})")

    print("\n🎉 Database is ready. You can now start the app (uvicorn app.main:app).")


if __name__ == "__main__":
    asyncio.run(main())
