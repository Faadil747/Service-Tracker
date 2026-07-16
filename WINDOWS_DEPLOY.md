# Self-hosting SocialTracker on a Windows VPS (single process)

This runs the **whole app as one process**: the FastAPI backend serves the API
**and** the built React frontend on a single port, talking to your **MS SQL
Server**. No separate web server, no CORS, no domain required — you reach it at
`http://<server-ip>:8000`.

> This is independent of the Render + Vercel deployment. Both can run at the same
> time (they point at their own config).

---

## 1. Install prerequisites (once, over Remote Desktop)

Download + install on the server:

| Tool | Link | Notes |
|------|------|-------|
| Python 3.11+ | https://www.python.org/downloads/ | ✅ tick **"Add python.exe to PATH"** |
| Node.js LTS | https://nodejs.org/ | to build the frontend |
| Git | https://git-scm.com/download/win | to pull the code |
| ODBC Driver 17 for SQL Server | https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server | already present if SSMS is installed |
| NSSM (optional, for 24/7) | https://nssm.cc/download | run uvicorn as a Windows service |

Open a **new** PowerShell after installing so PATH is refreshed. Verify:
```powershell
python --version ; node --version ; git --version
```

## 2. Get the code + configure

```powershell
cd C:\
git clone https://github.com/Faadil747/Service-Tracker.git
cd Service-Tracker
copy deploy\env.production.example backend\.env
notepad backend\.env      # fill DB_PWD, ADMIN_PASSWORD, SECRET_KEY (and LinkedIn if you have it)
```
The DB values are pre-filled for your `LinkedInTest` MS SQL database — you only
need the **SQL password** (the one that worked in SSMS).

## 3. Build + install (one command)

Run PowerShell **as Administrator**, then:
```powershell
cd C:\Service-Tracker
powershell -ExecutionPolicy Bypass -File deploy\windows-vps-setup.ps1
```
This creates the Python venv, installs backend deps, builds the frontend into
`backend\static`, and opens firewall port 8000.

## 4. Run it

Foreground test first:
```powershell
cd C:\Service-Tracker\backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000
```
Open **`http://<server-public-ip>:8000`** in a browser. Log in with the
`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend\.env`. `Ctrl+C` to stop.

## 5. Keep it running 24/7 (Windows service via NSSM)

```powershell
# From an elevated PowerShell (adjust the nssm.exe path to where you unzipped it)
$uvicorn = "C:\Service-Tracker\backend\.venv\Scripts\uvicorn.exe"
nssm install SocialTracker $uvicorn "app.main:app --host 0.0.0.0 --port 8000"
nssm set SocialTracker AppDirectory "C:\Service-Tracker\backend"
nssm set SocialTracker Start SERVICE_AUTO_START
nssm start SocialTracker
```
Now it starts on boot and restarts on crash. Manage with
`nssm restart SocialTracker` / `nssm stop SocialTracker`.

## 6. Updating to a new version

```powershell
cd C:\Service-Tracker
git pull
powershell -ExecutionPolicy Bypass -File deploy\windows-vps-setup.ps1   # rebuild
nssm restart SocialTracker                                              # if using the service
```

---

## Notes & troubleshooting

- **Clean URL (no `:8000`):** we use **8000** and don't touch IIS. To serve on
  port 80, either stop IIS's *Default Web Site* in IIS Manager and run uvicorn
  with `--port 80`, or add an IIS reverse proxy (ARR + URL Rewrite) 80 → 8000.
- **DB login fails:** re-check `DB_PWD` in `backend\.env`; confirm the same
  credentials work in SSMS. `DB_DRIVER` must match an installed driver
  (`ODBC Driver 17 for SQL Server`).
- **Not reachable from outside:** ensure the cloud provider's network firewall
  (not just Windows Firewall) allows inbound TCP 8000 to this server.
- **LinkedIn:** you can leave the LinkedIn fields blank in `.env` and set them
  later in the app's **Settings → API** page.
- **Tables:** your `LinkedInTest` DB already has the schema; the app also runs
  `create_all` on start, so nothing else is needed.

---

## The other deployment (Render + Vercel)

Unchanged and can run alongside this. Backend on Render (Docker image includes
the ODBC driver) now points at the **same MS SQL Server** — set these on Render →
Environment, then redeploy:

```
DB_SERVER   = P3NWPLSK12SQL-v08.shr.prod.phx3.secureserver.net
DB_DATABASE = LinkedInTest
DB_UID      = LinkedInTest
DB_PWD      = <your SQL password>
DB_DRIVER   = ODBC Driver 17 for SQL Server
DB_ENCRYPT  = false
```
Leave `DATABASE_URL` blank (MS SQL wins when all `DB_*` are set). Frontend on
Vercel: set `VITE_API_URL = https://social-tracker-api-wntl.onrender.com`.
