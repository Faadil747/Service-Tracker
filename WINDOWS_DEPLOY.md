# Self-hosting SocialTracker on a Windows VPS (single process)

Runs the **whole app as one process**: the FastAPI backend serves the API **and**
the built React frontend on a single port, talking to your **MS SQL Server**. No
separate web server, no CORS, no domain required - reach it at
`http://<server-ip>:8000`.

> Independent of the Render + Vercel deployment; both can run at once.

---

## Fastest: one command (recommended)

1. **Remote Desktop** into the server.
2. Open **PowerShell as Administrator** (right-click -> Run as administrator).
3. Paste this one line:

   ```powershell
   irm https://raw.githubusercontent.com/Faadil747/Service-Tracker/main/deploy/one-click.ps1 | iex
   ```

It installs any missing prerequisites (Git, Python, Node) via `winget`, pulls the
code to `C:\SocialTracker`, builds the frontend into the backend, installs the
Python deps, **prompts once** for your MS SQL password + an admin password, opens
firewall port 8000, and registers a 24/7 **NSSM Windows service** that starts on
boot. It finishes by printing the URL, e.g. `http://<server-ip>:8000`.

- Re-running the same command **updates** the app (pulls latest + rebuilds + restarts).
- If it says a tool "still not on PATH", close the window, open a **new** admin
  PowerShell, and paste the command again.
- If `winget` isn't available (older Windows Server), install Git + Python 3.11 +
  Node LTS manually first (links below), then re-run.

> ODBC Driver 17 for SQL Server is already present if SSMS is installed.

Prereq download links (only needed if winget is unavailable):
Python 3.11 (tick "Add to PATH") <https://www.python.org/downloads/> ·
Node LTS <https://nodejs.org/> · Git <https://git-scm.com/download/win>

---

## Manual steps (if you prefer to run them yourself)

```powershell
# 1. get the code
cd C:\ ; git clone https://github.com/Faadil747/Service-Tracker.git ; cd Service-Tracker

# 2. backend deps
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install -r requirements.txt

# 3. build frontend into backend\static (same-origin)
cd ..\frontend
npm install
"VITE_API_URL=" | Out-File .env.production -Encoding ascii -Force
npm run build
Remove-Item ..\backend\static -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item .\dist ..\backend\static -Recurse

# 4. configure
cd ..\backend
copy ..\deploy\env.production.example .env
notepad .env        # fill DB_PWD, ADMIN_PASSWORD, SECRET_KEY

# 5. firewall + run
New-NetFirewallRule -DisplayName "SocialTracker 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000
```

Open `http://<server-public-ip>:8000` and log in with your admin credentials.

### Make it permanent (NSSM service)

```powershell
# download nssm.exe from https://nssm.cc/download, then (adjust the path):
$uvicorn = "C:\Service-Tracker\backend\.venv\Scripts\uvicorn.exe"
nssm install SocialTracker $uvicorn "app.main:app --host 0.0.0.0 --port 8000"
nssm set SocialTracker AppDirectory "C:\Service-Tracker\backend"
nssm set SocialTracker Start SERVICE_AUTO_START
nssm start SocialTracker
```
Manage with `nssm restart|stop|status SocialTracker`.

---

## Notes & troubleshooting

- **Clean URL (no `:8000`):** we use 8000 and don't touch IIS. To serve on port
  80, stop IIS's *Default Web Site* and run uvicorn with `--port 80`, or add an
  IIS reverse proxy (ARR + URL Rewrite) 80 -> 8000.
- **DB login fails:** re-check `DB_PWD` in `backend\.env`; it must match SSMS.
  `DB_DRIVER` must be an installed driver (`ODBC Driver 17 for SQL Server`).
- **Not reachable from outside:** allow inbound TCP 8000 in the VPS/cloud network
  firewall too (not only Windows Firewall).
- **LinkedIn:** leave the LinkedIn fields blank and set them later in the app's
  **Settings -> API** page.
- **Tables:** your `LinkedInTest` DB already has the schema; the app also runs
  `create_all` on start.
- **Service logs:** `backend\service.log` and `backend\service.err.log`.

---

## The other deployment (Render + Vercel)

Backend on Render (its Docker image bundles the ODBC driver) points at the **same
MS SQL Server**. Render -> Environment:

```
DB_SERVER   = P3NWPLSK12SQL-v08.shr.prod.phx3.secureserver.net
DB_DATABASE = LinkedInTest
DB_UID      = LinkedInTest
DB_PWD      = <your SQL password>
DB_DRIVER   = ODBC Driver 17 for SQL Server
DB_ENCRYPT  = false
```
Leave `DATABASE_URL` blank (MS SQL wins when all `DB_*` are set). Vercel frontend:
`VITE_API_URL = https://social-tracker-api-wntl.onrender.com`.
