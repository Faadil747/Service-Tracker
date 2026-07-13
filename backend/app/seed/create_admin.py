"""Create (or update) the first admin from environment variables.

Use this in production instead of the full demo seed:

    ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='StrongPass!23' python -m app.seed.create_admin

Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME (see .env.example). Safe to re-run:
it creates the admin if missing, or resets that admin's password if it already exists.
"""
import asyncio
import os
import uuid

from sqlalchemy import select

from app.database import init_db, AsyncSessionLocal
from app.models import User
from app.services.auth_service import hash_password


async def main():
    email = os.getenv("ADMIN_EMAIL", "admin@gorecruitai.com").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "").strip()
    name = os.getenv("ADMIN_NAME", "Administrator").strip()

    if not password:
        raise SystemExit("ADMIN_PASSWORD is required (set it in the environment).")
    if len(password) < 8:
        raise SystemExit("ADMIN_PASSWORD must be at least 8 characters.")

    # Make sure the schema exists before touching it.
    await init_db()

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            existing.hashed_password = hash_password(password)
            existing.role = "admin"
            existing.is_active = True
            action = "updated (password reset)"
        else:
            db.add(User(
                id=str(uuid.uuid4()),
                email=email,
                full_name=name,
                hashed_password=hash_password(password),
                role="admin",
                region="Global",
                is_active=True,
            ))
            action = "created"
        await db.commit()

    print(f"✅ Admin {action}: {email}")


if __name__ == "__main__":
    asyncio.run(main())
