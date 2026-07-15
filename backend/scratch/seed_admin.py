import asyncio
import uuid
from app.database import AsyncSessionLocal
from app.models import User
from app.services.auth_service import hash_password

async def main():
    print("Manually seeding admin user...")
    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            existing = (await db.execute(select(User).where(User.email == "admin@gorecruitai.com"))).scalar_one_or_none()
            if existing is None:
                admin = User(
                    id=str(uuid.uuid4()),
                    email="admin@gorecruitai.com",
                    full_name="Administrator",
                    hashed_password=hash_password("adminpassword123"),
                    role="admin",
                    region="Global",
                    is_active=True
                )
                db.add(admin)
                await db.commit()
                print("Admin user seeded successfully!")
            else:
                print("Admin user already exists.")
    except Exception as e:
        print(f"Failed to seed admin user: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
