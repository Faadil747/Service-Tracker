<#
  windows-vps-setup.ps1 — set up SocialTracker on a Windows VPS as ONE process
  (the backend serves both the API and the built frontend on a single port).

  RUN AS ADMINISTRATOR, from anywhere. Prerequisites (install once, see
  WINDOWS_DEPLOY.md): Python 3.11+, Node.js LTS, Git, and "ODBC Driver 17 for
  SQL Server". Then:

      git clone https://github.com/Faadil747/Service-Tracker.git
      cd Service-Tracker
      copy deploy\env.production.example backend\.env   # then edit backend\.env
      powershell -ExecutionPolicy Bypass -File deploy\windows-vps-setup.ps1

  What it does: installs backend deps in a venv, builds the frontend (same-origin)
  into backend\static, opens the firewall port, and prints how to run it.
#>
param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot         # ..\ (script lives in .\deploy)
$Backend  = Join-Path $RepoRoot "backend"
$Frontend = Join-Path $RepoRoot "frontend"

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Yellow }
Write-Host "== SocialTracker — Windows single-process setup ==" -ForegroundColor Cyan
Write-Host "repo: $RepoRoot   port: $Port"

# 0) sanity: required tools on PATH
foreach ($t in @("python","npm","git")) {
    if (-not (Get-Command $t -ErrorAction SilentlyContinue)) {
        throw "'$t' is not installed / not on PATH. Install it first (see WINDOWS_DEPLOY.md)."
    }
}

# 1) Backend: virtualenv + dependencies
Step "1/4" "Python virtual env + backend dependencies"
Set-Location $Backend
if (-not (Test-Path ".venv")) { python -m venv .venv }
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\pip.exe" install -r requirements.txt

# 2) Frontend: build same-origin bundle and copy into backend\static
Step "2/4" "Building frontend (same-origin) into backend\static"
Set-Location $Frontend
if (-not (Test-Path "node_modules")) { npm install }
# Empty VITE_API_URL => the SPA calls its own host (this same process).
"VITE_API_URL=" | Out-File -FilePath ".env.production" -Encoding ascii -Force
npm run build
$Static = Join-Path $Backend "static"
if (Test-Path $Static) { Remove-Item $Static -Recurse -Force }
Copy-Item (Join-Path $Frontend "dist") $Static -Recurse
Write-Host "  frontend copied -> $Static" -ForegroundColor Green

# 3) Firewall: allow the app port inbound
Step "3/4" "Firewall rule for inbound TCP $Port"
$rule = "SocialTracker $Port"
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null
    Write-Host "  added inbound allow for TCP $Port" -ForegroundColor Green
} else { Write-Host "  rule already exists" -ForegroundColor Green }

# 4) .env presence check
Step "4/4" "Checking backend\.env"
if (-not (Test-Path (Join-Path $Backend ".env"))) {
    Write-Host "  MISSING: copy deploy\env.production.example -> backend\.env and fill it in." -ForegroundColor Red
} else { Write-Host "  backend\.env present" -ForegroundColor Green }

Write-Host "`n== Setup complete ==" -ForegroundColor Cyan
Write-Host "Run it now (foreground test):" -ForegroundColor White
Write-Host "  cd `"$Backend`"" -ForegroundColor Gray
Write-Host "  .\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port $Port" -ForegroundColor Gray
Write-Host "Then open:  http://<this-server-public-ip>:$Port" -ForegroundColor White
Write-Host "To keep it running 24/7 as a Windows service, see the NSSM section in WINDOWS_DEPLOY.md." -ForegroundColor White
