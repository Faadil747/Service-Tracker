import asyncio
import urllib.parse
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def check_users():
    server = "P3NWPLSK12SQL-v08.shr.prod.phx3.secureserver.net"
    database = "LinkedInTest"
    uid = "LinkedInTest"
    pwd = "8y@Av54b9"
    driver = "ODBC Driver 18 for SQL Server"
    
    driver_clean = driver.strip("{}")
    conn_str = (
        f"Driver={{{driver_clean}}};"
        f"Server={server};"
        f"Database={database};"
        f"Uid={uid};"
        f"Pwd={pwd};"
        "Encrypt=no;"
        "TrustServerCertificate=yes;"
    )
    quoted_conn_str = urllib.parse.quote_plus(conn_str)
    db_url = f"mssql+aioodbc:///?odbc_connect={quoted_conn_str}"
    
    try:
        engine = create_async_engine(db_url, echo=False)
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT email, role, full_name FROM users"))
            users = res.fetchall()
            print(f"Users in database: {users}")
    except Exception as e:
        print(f"Failed to fetch users: {str(e)}")

if __name__ == "__main__":
    asyncio.run(check_users())
