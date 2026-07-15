import asyncio
from app.database import init_db

async def main():
    print("Initializing database tables...")
    try:
        await init_db()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Database initialization failed: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
