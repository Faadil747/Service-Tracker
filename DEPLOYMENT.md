# Deployment Guide — Social Tracker

Host the platform with **Frontend → Vercel**, **Backend → Render**, **Database → managed MySQL**.

```
   Browser ──▶ Vercel (React SPA)  ──HTTPS──▶  Render (FastAPI)  ──▶  MySQL (managed)
              VITE_API_URL ─────────────────▶  reads DATABASE_URL
```

Everything the code needs is already wired: the frontend reads `VITE_API_URL`, the backend
reads `DATABASE_URL` + CORS origins from env, and MySQL drivers/SSL are handled. You only
need to create the three cloud resources and paste a few values between them.

> **Heads-up:** Render does **not** offer managed MySQL. Use an external MySQL host
> (options below). Render only runs the API.

---

## 0. Prerequisites

1. Push this repo to **GitHub** (Render and Vercel both deploy from GitHub):
   ```bash
   git add -A && git commit -m "Deploy config"
   git push origin main        # or your branch
   ```
2. Create free accounts: **[Render](https://render.com)**, **[Vercel](https://vercel.com)**,
   and one MySQL host from Step 1.

---

## 1. Create the MySQL database

Pick one (all have a free tier). You need a **connection string** and whether it needs **TLS**.

| Host | Free? | TLS (`DB_SSL`) | Notes |
|------|-------|----------------|-------|
| **Aiven for MySQL** | Yes (1 mo trial / hobbyist) | `true` | Simple, reliable |
| **TiDB Cloud Serverless** | Yes (generous) | `true` | MySQL-compatible |
| **Railway MySQL** | Trial credits | usually `false` | Easiest UI |
| **Clever Cloud / filess.io** | Yes | `true` | Small quotas |

Whatever you pick, you'll get parts like: `host`, `port` (usually 3306), `user`, `password`, `database`.
Assemble them into the **async** URL the backend expects:

```
mysql+asyncmy://USER:PASSWORD@HOST:PORT/DBNAME
```

- If the provider gave you `mysql://…?ssl-mode=REQUIRED`, drop the `mysql://` → use `mysql+asyncmy://…`,
  remove the `?ssl-mode=…` part, and set **`DB_SSL=true`** instead.
- If the password has special characters (`@ : / #`), URL-encode them.

Keep this URL + the `DB_SSL` value for Step 2.

---

## 2. Deploy the backend on Render

**Option A — Blueprint (recommended):** the repo ships a [`render.yaml`](render.yaml).
Render → **New → Blueprint** → pick this repo → it creates the `social-tracker-api` web service.

**Option B — Manual Web Service:** Render → **New → Web Service** → this repo, then set:
- **Root Directory:** `backend`
- **Runtime:** Python 3 · **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health check path:** `/health`

Then set **Environment Variables** (Render dashboard → your service → Environment):

| Key | Value |
|-----|-------|
| `PYTHON_VERSION` | `3.12.4` |
| `SECRET_KEY` | a long random string (`python -c "import secrets;print(secrets.token_urlsafe(48))"`) |
| `DATABASE_URL` | the `mysql+asyncmy://…` URL from Step 1 |
| `DB_SSL` | `true` or `false` (per Step 1) |
| `DEV_MODE` | `false` |
| `FRONTEND_URL` | leave blank for now (fill in Step 4) |
| `BACKEND_PUBLIC_URL` | your Render URL, e.g. `https://social-tracker-api.onrender.com` |
| `ADMIN_EMAIL` | your admin login email |
| `ADMIN_PASSWORD` | a strong password (≥ 8 chars) |
| `DEEPSEEK_API_KEY`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID` | optional — you can also set these later **in-app** (Settings → API & Connections) |

Click **Deploy**. Tables are created automatically on first boot (`create_all`).

### Create your admin login
After the first successful deploy, open the service **Shell** (Render → your service → *Shell*)
and run:

```bash
python -m app.seed.create_admin
```

It reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the env you set and creates the admin
(safe to re-run — it resets that admin's password).

> Prefer demo data (sample agents, tasks, posts)? Run `python -m app.seed.seed_data` instead —
> then **immediately change every password** via Settings → Change Password. Demo logins ship
> with weak defaults (`admin@gorecruitai.com` / `Admin@123`, agents `Agent@123`).

Verify: open `https://<your-render-app>.onrender.com/health` → `{"status":"healthy"}`.

---

## 3. Deploy the frontend on Vercel

Vercel → **Add New → Project** → import this repo, then:
- **Root Directory:** `frontend`
- **Framework Preset:** Vite (auto-detected; build `npm run build`, output `dist`)
- **Environment Variable:**
  - `VITE_API_URL` = your Render backend URL, e.g. `https://social-tracker-api.onrender.com` (no trailing slash)

Click **Deploy**. [`frontend/vercel.json`](frontend/vercel.json) already handles SPA routing so
deep links like `/settings` work on refresh.

Vercel gives you a URL like `https://your-app.vercel.app`.

---

## 4. Connect the two (CORS)

1. In **Render** → your service → Environment, set:
   - `FRONTEND_URL` = `https://your-app.vercel.app`
2. **Save** → Render redeploys.

> `*.vercel.app` preview URLs are already allowed by a CORS regex, so logins work even before
> this step — but setting `FRONTEND_URL` to your production domain is cleaner and required if
> you later use a **custom domain** (add it to `FRONTEND_URL` or `ALLOWED_ORIGINS`, comma-separated).

---

## 5. First login

1. Open your Vercel URL → log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Settings → Change Password** to rotate it.
3. **Settings → API & Connections** (admin only) — paste your **DeepSeek** and **LinkedIn**
   keys here to enable AI generation + LinkedIn publishing. These apply live and persist in the
   DB, so you never have to touch env files again.

Done — the platform is live. 🎉

---

## Important notes & caveats

- **Ephemeral uploads (Render free/standard):** uploaded post images & avatars are stored on the
  server's local disk (`/uploads`), which Render **wipes on every redeploy/restart**. For
  permanent media, either add a **Render Persistent Disk** (paid) mounted at `backend/uploads`,
  or switch uploads to a service like Cloudinary/S3 (ask me and I'll wire it in).
- **Free-tier cold starts:** Render's free web service sleeps after ~15 min idle; the first request
  then takes ~50s to wake. Upgrade the plan or ping `/health` periodically to keep it warm.
- **Secrets:** never commit real keys. `.env` is git-ignored; only `.env.example` is tracked.
  Rotate `SECRET_KEY` and all passwords for production.
- **LinkedIn OAuth:** if you use the OAuth login flow, set `LINKEDIN_REDIRECT_URI` to
  `https://<your-render-app>.onrender.com/api/auth/linkedin/callback` and register that exact URL
  in your LinkedIn app.

---

## Local development (Windows)

Backend (SQLite — zero setup):
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # optional; defaults are fine for local
python -m app.seed.seed_data    # demo data + logins
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (uses http://localhost:8000 by default)
```

To test **MySQL locally**, install MySQL (or run `docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=pass -e MYSQL_DATABASE=social mysql:8`),
then set `DATABASE_URL=mysql+asyncmy://root:pass@localhost:3306/social` in `backend/.env`.
