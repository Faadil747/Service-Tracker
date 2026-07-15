# Windows + MS SQL Server hosting guide

Run the FastAPI backend on a **Windows host** against your **GoDaddy MS SQL Server**
(`LinkedInTest`). Frontend stays on **Vercel**.

> **The one hard rule:** your SQL Server hostname
> (`P3NWPLSK12SOL-v08.shr.prod.phx3.secureserver.net`) does **not** resolve on the public
> internet — it only works from **inside GoDaddy's hosting network**. So the backend must
> run on a Windows host that can reach it (see "Which host?" at the bottom). You cannot
> initialize this DB from a laptop or from Render.

---

## What's already done (code is MS SQL-ready)
- `pyodbc` + `aioodbc` drivers in `requirements.txt`.
- `String`/`Text` render as **NVARCHAR** on MS SQL so emojis/international text are safe.
- Table creation on startup skips the SQLite-only ALTER patches (MS SQL-safe).
- Tables + your admin are created **automatically on the app's first run**.

---

## 1. Prerequisites on the Windows host
- **Python 3.12** (`python --version`).
- **Microsoft ODBC Driver 17 for SQL Server** — check with PowerShell:
  ```powershell
  Get-OdbcDriver | Where-Object Name -like "*SQL Server*"
  ```
  If missing, install "ODBC Driver 17 for SQL Server" from Microsoft.
- The host must be able to reach the SQL Server (test in PowerShell):
  ```powershell
  Test-NetConnection -ComputerName P3NWPLSK12SOL-v08.shr.prod.phx3.secureserver.net -Port 1433
  ```
  `TcpTestSucceeded : True` = good. `False` = wrong host (see "Which host?").

## 2. Get the code + install deps
```powershell
git clone https://github.com/Faadil747/Service-Tracker.git
cd Service-Tracker\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 3. Configure `backend\.env`
Create `backend\.env` with:
```
DATABASE_URL=mssql+aioodbc://LinkedInTest:8y%40Av54b9@P3NWPLSK12SOL-v08.shr.prod.phx3.secureserver.net:1433/LinkedInTest?driver=ODBC+Driver+17+for+SQL+Server&TrustServerCertificate=yes
DB_SSL=false
DEV_MODE=false
SECRET_KEY=<a long random string>
ADMIN_EMAIL=admin@gorecruitai.com
ADMIN_PASSWORD=<a strong password>
FRONTEND_URL=https://service-tracker-six-smoky.vercel.app
```
*(The `@` in the DB password is URL-encoded as `%40`. 🔒 rotate that password since it's been shared.)*

## 4. Verify connectivity + create the tables
```powershell
python -m app.seed.check_db
```
This connects, runs `create_all`, and lists the tables. `🎉 Database is ready` = your
`LinkedInTest` database is now initialized. (If it can't connect, it tells you why.)

## 5. Run it
**Quick test:**
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open `http://localhost:8000/health` → `{"status":"healthy"}`. Your admin is auto-created on
first boot (from `ADMIN_EMAIL`/`ADMIN_PASSWORD`).

**Production (keep it running 24/7)** — two common options:
- **NSSM (simplest):** install [NSSM](https://nssm.cc), then create a service that runs
  `.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000` with the
  working dir = `backend`. It auto-starts on boot and restarts on crash.
- **IIS reverse proxy:** run uvicorn on `127.0.0.1:8000` and put IIS (with URL Rewrite +
  Application Request Routing, or HttpPlatformHandler) in front on 80/443. Best if you want
  IIS to handle TLS.

Open the chosen port in **Windows Firewall**.

## 6. Connect the Vercel frontend  ⚠️ must be HTTPS
Your frontend is served over **HTTPS** (Vercel), so browsers will **block** calls to an
**HTTP** backend (mixed content). The Windows API therefore needs a **public HTTPS URL**:
- Point a domain at the server and terminate TLS (IIS + [win-acme](https://www.win-acme.com/)
  for a free cert), **or** put **Cloudflare** in front (proxied DNS → free HTTPS).
- Then in **Vercel → Settings → Environment Variables** set:
  ```
  VITE_API_URL = https://your-api-domain.com
  ```
  and **redeploy** Vercel (Vite bakes it at build time).
- Set `FRONTEND_URL` in `backend\.env` to your Vercel URL (already above) and restart the service.

---

## Which host? (pick before you start)
The SQL Server is internal to GoDaddy, so:

| Your Windows host | Reaches the GoDaddy DB? | Can run FastAPI? | Verdict |
|---|---|---|---|
| **GoDaddy Windows VPS / Dedicated** (full RDP) | ✅ if same account/network (verify with `Test-NetConnection`) | ✅ yes | **Best** — follow this guide as-is |
| **GoDaddy Windows *Shared* (Plesk/IIS)** | ✅ likely | ⚠️ usually **no** — shared Windows plans run ASP.NET/PHP, not Python ASGI | Not recommended for FastAPI |
| **Separate Windows server** (Azure/AWS/own) | ❌ probably not (internal hostname won't resolve) — needs GoDaddy to expose the DB publicly + IP allow-list | ✅ yes | Only if GoDaddy gives a **public** SQL endpoint |

**Recommendation:** a **GoDaddy Windows VPS/Dedicated** tied to this database is the clean
path — it can reach the internal SQL host and run Python. If you can only get **shared**
Windows hosting, FastAPI won't run there; in that case either get a VPS, or ask GoDaddy for a
**publicly reachable** SQL endpoint so you can host the backend elsewhere (or go back to the
working Aiven MySQL).
