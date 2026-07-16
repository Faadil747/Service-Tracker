#Requires -RunAsAdministrator
<#
  one-click.ps1 - full install of SocialTracker on a Windows VPS as ONE process
  (backend serves the API + the built frontend on a single port), running 24/7
  as an NSSM Windows service, backed by your MS SQL Server.

  RUN over Remote Desktop, in an ELEVATED PowerShell (Run as Administrator):

      irm https://raw.githubusercontent.com/Faadil747/Service-Tracker/main/deploy/one-click.ps1 | iex

  It is idempotent - safe to re-run to update. You are prompted once for the
  MS SQL password and an admin password (unless backend\.env already exists).
#>
param(
    [string]$InstallDir = "C:\SocialTracker",
    [int]$Port          = 8000,
    [string]$Repo       = "https://github.com/Faadil747/Service-Tracker.git"
)
$ErrorActionPreference = "Stop"
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Info($m) { Write-Host $m -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

Info "== SocialTracker one-click installer =="

# --- 1. Prerequisites (auto-install via winget when missing) ---
function Ensure-Tool($cmd, $wingetId, $name) {
    if (Have $cmd) { Ok "$name present"; return }
    if (Have winget) {
        Warn "installing $name ..."
        winget install --id $wingetId -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
    } else {
        throw "$name is missing and winget is unavailable. Install $name manually (see WINDOWS_DEPLOY.md), then re-run."
    }
}
Ensure-Tool git    "Git.Git"            "Git"
Ensure-Tool python "Python.Python.3.11" "Python 3.11"
Ensure-Tool node   "OpenJS.NodeJS.LTS"  "Node.js"
# Refresh PATH so tools installed above are visible in this session.
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
foreach ($t in @("git","python","node")) {
    if (-not (Have $t)) { throw "'$t' still not on PATH after install. Close this window, open a NEW admin PowerShell, and re-run the command." }
}

# --- 2. Get the code ---
if (Test-Path (Join-Path $InstallDir ".git")) {
    Info "[code] updating existing checkout at $InstallDir"
    git -C $InstallDir pull
} else {
    Info "[code] cloning into $InstallDir"
    git clone $Repo $InstallDir
}
$Backend  = Join-Path $InstallDir "backend"
$Frontend = Join-Path $InstallDir "frontend"

# --- 3. Backend venv + dependencies ---
Info "[python] virtual env + dependencies"
Push-Location $Backend
if (-not (Test-Path ".venv")) { python -m venv .venv }
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip | Out-Null
& ".\.venv\Scripts\pip.exe" install -r requirements.txt
Pop-Location

# --- 4. Build frontend (same-origin) into backend\static ---
Info "[frontend] building"
Push-Location $Frontend
if (-not (Test-Path "node_modules")) { npm install }
"VITE_API_URL=" | Out-File ".env.production" -Encoding ascii -Force   # empty => same-origin
npm run build
$Static = Join-Path $Backend "static"
if (Test-Path $Static) { Remove-Item $Static -Recurse -Force }
Copy-Item (Join-Path $Frontend "dist") $Static -Recurse
Pop-Location
Ok "frontend -> backend\static"

# --- 5. backend\.env (prompt once for secrets if absent) ---
$envFile = Join-Path $Backend ".env"
if (-not (Test-Path $envFile)) {
    Info "[config] creating backend\.env"
    function Read-Secret($label) {
        $s = Read-Host $label -AsSecureString
        return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    }
    $sqlPwd   = Read-Secret "  MS SQL password for login 'LinkedInTest'"
    $adminPwd = Read-Secret "  Choose an app admin password (login admin@gorecruitai.com)"
    $secret   = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    @"
DB_SERVER=P3NWPLSK12SQL-v08.shr.prod.phx3.secureserver.net
DB_DATABASE=LinkedInTest
DB_UID=LinkedInTest
DB_PWD=$sqlPwd
DB_DRIVER=ODBC Driver 17 for SQL Server
DB_ENCRYPT=false
ADMIN_EMAIL=admin@gorecruitai.com
ADMIN_PASSWORD=$adminPwd
ADMIN_NAME=Administrator
SECRET_KEY=$secret
DEV_MODE=false
LINKEDIN_ORG_ID=15078287
"@ | Out-File $envFile -Encoding ascii -Force
    Ok "wrote backend\.env"
} else {
    Ok "backend\.env already exists - keeping it"
}

# --- 6. Firewall: allow the app port inbound ---
Info "[firewall] allowing inbound TCP $Port"
if (-not (Get-NetFirewallRule -DisplayName "SocialTracker $Port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "SocialTracker $Port" -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null
}
Ok "Windows Firewall allows TCP $Port (also open it in your VPS/cloud network firewall)"

# --- 7. NSSM service (download nssm.exe, (re)install the service) ---
Info "[service] installing the 'SocialTracker' Windows service (NSSM)"
$nssmExe = Join-Path $InstallDir "nssm\nssm.exe"
if (-not (Test-Path $nssmExe)) {
    $zip = Join-Path $env:TEMP "nssm.zip"
    Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath (Join-Path $InstallDir "nssm_tmp") -Force
    $found = Get-ChildItem (Join-Path $InstallDir "nssm_tmp") -Recurse -Filter nssm.exe |
             Where-Object { $_.FullName -match "win64" } | Select-Object -First 1
    New-Item -ItemType Directory -Force -Path (Split-Path $nssmExe) | Out-Null
    Copy-Item $found.FullName $nssmExe -Force
    Remove-Item (Join-Path $InstallDir "nssm_tmp") -Recurse -Force
}
$uvicorn = Join-Path $Backend ".venv\Scripts\uvicorn.exe"
# NSSM prints normal status to stderr; with EAP=Stop that would abort the script,
# and stop/remove on a not-yet-existing service errors. Relax EAP here and only
# stop/remove when the service already exists.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
if (Get-Service SocialTracker -ErrorAction SilentlyContinue) {
    & $nssmExe stop   SocialTracker         | Out-Null
    & $nssmExe remove SocialTracker confirm | Out-Null
}
& $nssmExe install SocialTracker $uvicorn                                              | Out-Null
& $nssmExe set SocialTracker AppParameters "app.main:app --host 0.0.0.0 --port $Port"  | Out-Null
& $nssmExe set SocialTracker AppDirectory $Backend                                     | Out-Null
& $nssmExe set SocialTracker Start SERVICE_AUTO_START                                   | Out-Null
& $nssmExe set SocialTracker AppStdout (Join-Path $Backend "service.log")               | Out-Null
& $nssmExe set SocialTracker AppStderr (Join-Path $Backend "service.err.log")           | Out-Null
& $nssmExe start SocialTracker                                                          | Out-Null
$ErrorActionPreference = $prevEAP
Ok "service 'SocialTracker' installed and started (auto-starts on boot)"

# --- 8. Health check + final URL ---
Start-Sleep -Seconds 10
try {
    $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 10
    Ok "health: $($h.status)"
} catch {
    Warn "not responding yet on :$Port - check: & '$nssmExe' status SocialTracker ; and $Backend\service.err.log"
}
try { $ip = (Invoke-RestMethod "https://api.ipify.org?format=json" -TimeoutSec 8).ip } catch { $ip = "<server-ip>" }
Info "`n== Done =="
Write-Host "Open:  http://${ip}:$Port" -ForegroundColor Green
Write-Host "Login: admin@gorecruitai.com  (the admin password you just set)" -ForegroundColor Green
Write-Host "Manage: & '$nssmExe' [restart|stop|status] SocialTracker" -ForegroundColor Gray
