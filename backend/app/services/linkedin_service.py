"""
LinkedIn service — real company-page data only.

Design notes
------------
LinkedIn day-throttles the follower/page-statistics endpoints (HTTP 429
"APPLICATION DAY limit reached"). If we called them on every dashboard poll we
would exhaust the quota within hours and then get nothing but 429s. So:

  * Every successful fetch is cached (in memory + on disk) as a "snapshot".
  * We only re-fetch from LinkedIn after LINKEDIN_SYNC_INTERVAL_MIN minutes.
  * When an endpoint is throttled/unavailable we keep the last REAL value and
    mark that field `stale` — we never fabricate numbers.

Anything LinkedIn will not give us with the current token (per-post
likes/comments → 403, day-by-day history → unsupported in this API version) is
simply reported as unavailable rather than filled with random data.
"""
import asyncio
import json
import os
import time
import urllib.parse
from datetime import date
from typing import Optional

import httpx

from app.config import settings

# ── Persisted snapshot cache ────────────────────────────────────────────────
_CACHE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "linkedin_cache.json")
_SNAPSHOT: dict = {}          # last good snapshot (in-memory)
_LAST_FETCH_TS: float = 0.0   # epoch seconds of last LinkedIn round-trip
_MIN_SYNC_SECONDS = 20        # debounce: even a manual sync can't refetch faster than this

# Company-posts cache. The /posts endpoint is quota-limited, so calling it on every
# dashboard/analytics poll exhausts the quota and returns nothing but 429s (the
# "Posts syncing" state). We cache the last good result, only re-fetch after the TTL,
# and keep serving the cached posts when a re-fetch is throttled.
_POSTS_CACHE: dict = {}
_POSTS_FETCH_TS: float = 0.0
# LinkedIn enforces a low DAILY limit on the /posts resource ("APPLICATION_AND_MEMBER
# DAY limit"). Company posts change rarely, so cache for hours (not minutes) to keep
# well under that cap, and — once throttled — back off for an hour rather than
# retrying every few minutes (which just wastes the day's allowance).
_POSTS_TTL_SECONDS = 6 * 60 * 60   # serve cached posts for 6h before a re-fetch
_POSTS_429_UNTIL: float = 0.0      # after a 429, don't re-hit /posts until this epoch
_POSTS_BACKOFF_SECONDS = 60 * 60   # …for 60 min (it's a DAY limit — polling won't help)

# Static URN → label maps (small, fixed sets — safe to resolve offline).
_SENIORITY = {
    "1": "Unpaid", "2": "Training", "3": "Entry", "4": "Senior", "5": "Manager",
    "6": "Director", "7": "VP", "8": "CXO", "9": "Partner", "10": "Owner",
}
_FUNCTION = {
    "1": "Accounting", "2": "Administrative", "3": "Arts & Design", "4": "Business Development",
    "5": "Community & Social Services", "6": "Consulting", "7": "Education", "8": "Engineering",
    "9": "Entrepreneurship", "10": "Finance", "11": "Healthcare Services", "12": "Human Resources",
    "13": "Information Technology", "14": "Legal", "15": "Marketing", "16": "Media & Communication",
    "17": "Military & Protective", "18": "Operations", "19": "Product Management",
    "20": "Program & Project Mgmt", "21": "Purchasing", "22": "Quality Assurance",
    "23": "Real Estate", "24": "Research", "25": "Sales", "26": "Support",
}


def _load_disk_cache() -> None:
    global _SNAPSHOT, _LAST_FETCH_TS, _POSTS_CACHE, _POSTS_FETCH_TS
    if _SNAPSHOT and _POSTS_CACHE:
        return
    try:
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not _SNAPSHOT:
            _SNAPSHOT = data.get("snapshot", {})
            _LAST_FETCH_TS = data.get("fetched_at", 0.0)
        if not _POSTS_CACHE:
            _POSTS_CACHE = data.get("posts", {}) or {}
            _POSTS_FETCH_TS = data.get("posts_fetched_at", 0.0)
    except Exception:
        pass


def _save_disk_cache() -> None:
    try:
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "snapshot": _SNAPSHOT, "fetched_at": _LAST_FETCH_TS,
                "posts": _POSTS_CACHE, "posts_fetched_at": _POSTS_FETCH_TS,
            }, f)
    except Exception as e:
        print(f"LinkedIn cache write failed: {e}")


# ── Refreshed-token persistence ─────────────────────────────────────────────
# When the access token is auto-refreshed we persist it next to the cache so a
# restart picks up the current token instead of the (possibly expired) one in
# .env. .env stays the seed/bootstrap source; this file is the live override.
_TOKEN_FILE = os.path.join(os.path.dirname(_CACHE_FILE), "linkedin_token.json")


def _persist_refreshed_token(access_token: str, refresh_token: str) -> None:
    try:
        with open(_TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump({"access_token": access_token, "refresh_token": refresh_token, "saved_at": time.time()}, f)
    except Exception as e:
        print(f"[LinkedIn] token persist failed: {e}")


def _load_persisted_token() -> None:
    """On startup, prefer a previously refreshed token over the .env seed."""
    try:
        with open(_TOKEN_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
        if d.get("access_token"):
            settings.LINKEDIN_ACCESS_TOKEN = d["access_token"]
        if d.get("refresh_token"):
            settings.LINKEDIN_REFRESH_TOKEN = d["refresh_token"]
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"[LinkedIn] token load failed: {e}")


async def _persist_refreshed_token_to_db(access_token: str, refresh_token: str) -> None:
    """Persist rotated tokens to the DURABLE ApiConfig table.

    The on-disk _TOKEN_FILE is ephemeral on hosts like Render — it's wiped on
    every restart/redeploy. LinkedIn ROTATES the refresh token on each exchange,
    so after a restart the disk file is gone and the app falls back to the stale
    .env refresh token that LinkedIn already invalidated → the next refresh fails
    and the integration goes dark. That was the #1 loophole behind "tokens expire
    very fast". Writing to ApiConfig (reloaded at startup by
    load_api_configs_into_settings) keeps the rotated tokens across restarts.
    """
    import uuid
    try:
        from app.database import AsyncSessionLocal
        from app.models import ApiConfig
        from sqlalchemy import select

        pairs = [("LINKEDIN_ACCESS_TOKEN", access_token)]
        if refresh_token:
            pairs.append(("LINKEDIN_REFRESH_TOKEN", refresh_token))
        async with AsyncSessionLocal() as session:
            for key, val in pairs:
                if not val:
                    continue
                row = (await session.execute(
                    select(ApiConfig).where(ApiConfig.key_name == key)
                )).scalar_one_or_none()
                if row:
                    row.value_encrypted = val
                else:
                    session.add(ApiConfig(
                        id=str(uuid.uuid4()), key_name=key, value_encrypted=val,
                        description="auto-rotated by LinkedIn token refresh",
                    ))
            await session.commit()
    except Exception as e:
        print(f"[LinkedIn] token DB-persist failed: {e}")


# Serialize token refreshes. LinkedIn rotates the refresh token on every use, so
# two concurrent refreshes would each try to spend the same refresh token — the
# second reuses an already-consumed token and fails, breaking the chain. A lock
# (plus a double-check inside it) guarantees exactly one refresh per expiry.
_refresh_lock: Optional[asyncio.Lock] = None


def _get_refresh_lock() -> asyncio.Lock:
    # Lazily created so it binds to the running event loop; the getter has no
    # await point, so this is race-free between coroutines.
    global _refresh_lock
    if _refresh_lock is None:
        _refresh_lock = asyncio.Lock()
    return _refresh_lock


async def seed_snapshot_from_db() -> None:
    """Seed the in-memory snapshot from the most recent FollowerSnapshot row.

    Render's free tier has an EPHEMERAL filesystem, so the on-disk cache is wiped
    on every restart/redeploy. Without this, after a cold start the dashboard and
    the whole "Detailed Analytics" section go blank until the next successful live
    sync — and LinkedIn day-throttles the stats endpoints, so that can be hours.
    Seeding from the durable DB means: (1) real numbers show immediately, and
    (2) the daily-persist path has a real 'followers' value to carry forward so
    the daily trend keeps accumulating instead of leaving gap days. Marked stale
    so the UI never presents old data as a fresh live reading.
    """
    global _SNAPSHOT, _LAST_FETCH_TS
    # Prefer the on-disk cache first: it holds the FULL last snapshot INCLUDING
    # demographics (seniority / job-function), which the DB row does not store. If
    # we seeded from the DB before loading it, the (demographics-less) DB seed would
    # shadow the richer disk cache and the Audience Insights charts would stay blank
    # until the next live sync. Only fall back to the DB seed when there's no disk
    # cache (e.g. a wiped ephemeral filesystem on Render).
    _load_disk_cache()
    if _SNAPSHOT:  # disk cache or a live fetch already populated it
        return
    try:
        from app.database import AsyncSessionLocal
        from app.models import FollowerSnapshot
        from sqlalchemy import select, desc

        async with AsyncSessionLocal() as session:
            row = (await session.execute(
                select(FollowerSnapshot).order_by(desc(FollowerSnapshot.snapshot_date))
            )).scalars().first()
        if row is None or not row.followers:
            return
        _SNAPSHOT = {
            "followers": int(row.followers or 0),
            "organic_followers": int(row.organic_followers or 0),
            "paid_followers": int(row.paid_followers or 0),
            "impressions": int(row.impressions or 0),
            "unique_impressions": int(row.unique_impressions or 0),
            "clicks": int(row.clicks or 0),
            "likes": int(row.likes or 0),
            "comments": int(row.comments or 0),
            "shares": int(row.shares or 0),
            "visitors": int(row.visitors or 0),
            "engagement_rate": float(row.engagement_rate or 0.0),
            "_meta": {
                "available": True,
                "served_from_db": True,
                "stale": True,
                "snapshot_date": str(row.snapshot_date),
                "last_updated": row.updated_at.isoformat() if getattr(row, "updated_at", None) else None,
            },
        }
        # Conservative: keep _LAST_FETCH_TS at 0 so the sync debounce never treats
        # this stale DB seed as a recent live fetch and suppresses the next sync.
        _LAST_FETCH_TS = 0.0
        print(f"[LinkedIn] seeded in-memory snapshot from DB row {row.snapshot_date}")
    except Exception as e:
        print(f"[LinkedIn] snapshot DB-seed failed: {e}")


class LinkedInService:
    def __init__(self):
        self.base_url = "https://api.linkedin.com/rest"
        self.api_version = "202606"

    # ── auth helpers ────────────────────────────────────────────────────────
    def _access_token(self) -> str:
        return settings.LINKEDIN_ACCESS_TOKEN

    def _has_credentials(self) -> bool:
        return bool(settings.LINKEDIN_ACCESS_TOKEN and settings.LINKEDIN_ORG_ID)

    def _auth_headers(self, extra: Optional[dict] = None, token: Optional[str] = None) -> dict:
        t = token or self._access_token()
        headers = {
            "Authorization": f"Bearer {t}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": self.api_version,
        }
        if extra:
            headers.update(extra)
        return headers

    async def _refresh_access_token(self, stale_token: Optional[str] = None) -> bool:
        """Exchange the refresh token for a fresh access token so the integration
        keeps working when LinkedIn's 60-day access token expires. Updates the
        in-memory token (and rotated refresh token), persists both to disk AND
        the durable DB, and returns True on success. A no-op returning False when
        no refresh token / client creds are set.

        `stale_token` is the access token that just 401'd; passing it lets us
        skip the network call when another coroutine already refreshed while we
        were queued on the lock (LinkedIn rotates the refresh token per use, so a
        redundant second refresh would fail on an already-spent token)."""
        if not (settings.LINKEDIN_REFRESH_TOKEN and settings.LINKEDIN_CLIENT_ID and settings.LINKEDIN_CLIENT_SECRET):
            return False
        async with _get_refresh_lock():
            # Another coroutine may have refreshed while we waited for the lock.
            if stale_token and settings.LINKEDIN_ACCESS_TOKEN != stale_token:
                return True
            rt = settings.LINKEDIN_REFRESH_TOKEN  # re-read: a prior refresh may have rotated it
            if not rt:
                return False
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        "https://www.linkedin.com/oauth/v2/accessToken",
                        data={
                            "grant_type": "refresh_token",
                            "refresh_token": rt,
                            "client_id": settings.LINKEDIN_CLIENT_ID,
                            "client_secret": settings.LINKEDIN_CLIENT_SECRET,
                        },
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                    )
                if resp.status_code == 200:
                    d = resp.json()
                    new_token = d.get("access_token")
                    if new_token:
                        settings.LINKEDIN_ACCESS_TOKEN = new_token
                        if d.get("refresh_token"):
                            settings.LINKEDIN_REFRESH_TOKEN = d["refresh_token"]
                        _persist_refreshed_token(new_token, settings.LINKEDIN_REFRESH_TOKEN)
                        await _persist_refreshed_token_to_db(new_token, settings.LINKEDIN_REFRESH_TOKEN)
                        print("[LinkedIn] access token refreshed successfully")
                        return True
                print(f"[LinkedIn] token refresh failed: HTTP {resp.status_code} {resp.text[:160]}")
            except Exception as e:
                print(f"[LinkedIn] token refresh error: {e}")
        return False

    async def _authed_get(self, client: httpx.AsyncClient, url: str, params: Optional[dict] = None) -> httpx.Response:
        """GET with the current token. On 401 (expired) it refreshes once and
        retries; if it still 401s it raises _TokenExpired. 429 -> _Throttled."""
        token_used = self._access_token()
        resp = await client.get(url, headers=self._auth_headers(token=token_used), params=params)
        if resp.status_code == 401:
            if await self._refresh_access_token(stale_token=token_used):
                resp = await client.get(url, headers=self._auth_headers(), params=params)
            if resp.status_code == 401:
                raise _TokenExpired()
        if resp.status_code == 429:
            raise _Throttled()
        resp.raise_for_status()
        return resp

    # ──────────────────────────────────────────────────────────────────────────
    # Publishing
    # ──────────────────────────────────────────────────────────────────────────
    async def publish_post(
        self,
        access_token: str,
        org_id: str,
        content: str,
        image_url: Optional[str] = None,
    ) -> dict:
        """Publish a text post to a LinkedIn org page via the modern Posts API."""
        token = access_token or self._access_token()
        org = org_id or settings.LINKEDIN_ORG_ID
        if not token or not org:
            raise RuntimeError("LinkedIn access token or org ID not configured")

        post_body = {
            "author": f"urn:li:organization:{org}",
            "commentary": content,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/posts",
                headers=self._auth_headers(token=token),
                json=post_body,
            )
            resp.raise_for_status()
            post_id = resp.headers.get("x-restli-id", "")
            if not post_id:
                location = resp.headers.get("Location", "")
                if "/posts/" in location:
                    post_id = urllib.parse.unquote(location.split("/posts/")[-1])
            return {"linkedin_post_id": post_id, "status": "published"}

    # ──────────────────────────────────────────────────────────────────────────
    # Real company-page snapshot (cached + throttle-aware)
    # ──────────────────────────────────────────────────────────────────────────
    async def get_org_snapshot(self, force: bool = False) -> dict:
        """
        Return a cached real snapshot of the company page's public analytics.

        Fields (all real, or omitted/stale when LinkedIn is unavailable):
          followers, organic_followers, paid_followers,
          impressions, unique_impressions, clicks, likes, comments, shares,
          engagement_rate, visitors, demographics{seniority[],function[]}
        Plus `_meta`: last_updated, rate_limited, stale_fields[], available (bool).
        """
        global _SNAPSHOT, _LAST_FETCH_TS
        _load_disk_cache()

        if not self._has_credentials():
            return {"_meta": {"available": False, "reason": "LinkedIn token or org ID not configured"}}

        # Manual-refresh mode: ordinary reads NEVER touch LinkedIn — that would
        # burn the daily API quota on every dashboard/reports poll. We always
        # serve the last real snapshot and still record today's row so the
        # 14-day trends keep accumulating (free — it's a DB write). A live fetch
        # happens ONLY on an explicit user sync (force=True → the Sync button).
        if not force:
            if _SNAPSHOT:
                await self._maybe_persist_today(_SNAPSHOT)
                meta = dict(_SNAPSHOT.get("_meta", {}))
                meta["served_from_cache"] = True
                meta["last_fetch_ts"] = _LAST_FETCH_TS
                return {**_SNAPSHOT, "_meta": meta}
            return {"_meta": {"available": False,
                              "reason": "Not synced yet — click Sync to load live LinkedIn data."}}

        # Debounce: even an explicit Sync can't refetch faster than _MIN_SYNC_SECONDS
        # (guards against double-clicks / rapid re-syncs burning the daily quota).
        if _SNAPSHOT and (time.time() - _LAST_FETCH_TS) < _MIN_SYNC_SECONDS:
            await self._maybe_persist_today(_SNAPSHOT)
            meta = dict(_SNAPSHOT.get("_meta", {}))
            meta["served_from_cache"] = True
            meta["synced_recently"] = True
            return {**_SNAPSHOT, "_meta": meta}

        # force=True — the user explicitly asked for a fresh pull. Fetch each
        # metric group independently so one throttled endpoint doesn't wipe out
        # the others.
        token = self._access_token()
        org = settings.LINKEDIN_ORG_ID
        fresh: dict = {}
        stale_fields: list[str] = []
        rate_limited = False
        token_expired = False

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Share statistics — impressions/clicks/likes/comments/engagement (reliable)
            try:
                share = await self._fetch_share_stats(client, token, org)
                fresh.update(share)
            except _Throttled:
                rate_limited = True
                stale_fields += ["impressions", "unique_impressions", "clicks", "likes", "comments", "shares", "engagement_rate"]
            except _TokenExpired:
                token_expired = True
            except Exception as e:
                print(f"LinkedIn share-stats error: {e}")
                stale_fields += ["impressions", "clicks", "likes", "comments", "engagement_rate"]

            # 2. Follower count + organic/paid split + raw demographics
            if not token_expired:
                try:
                    foll = await self._fetch_follower_stats(client, token, org)
                    fresh.update(foll)
                except _Throttled:
                    rate_limited = True
                    stale_fields += ["followers", "organic_followers", "paid_followers", "demographics"]
                except _TokenExpired:
                    token_expired = True
                except Exception as e:
                    print(f"LinkedIn follower-stats error: {e}")
                    stale_fields += ["followers", "demographics"]

            # Fallback total-follower source if follower-stats didn't yield one.
            if not token_expired and not fresh.get("followers"):
                try:
                    total = await self._fetch_follower_count(client, token, org)
                    if total:
                        fresh["followers"] = total
                        if "followers" in stale_fields:
                            stale_fields.remove("followers")
                except _Throttled:
                    rate_limited = True
                except _TokenExpired:
                    token_expired = True
                except Exception as e:
                    print(f"LinkedIn networkSizes error: {e}")

            # 3. Page visitors
            if not token_expired:
                try:
                    fresh["visitors"] = await self._fetch_page_stats(client, token, org)
                except _Throttled:
                    rate_limited = True
                    stale_fields.append("visitors")
                except _TokenExpired:
                    token_expired = True
                except Exception as e:
                    print(f"LinkedIn page-stats error: {e}")
                    stale_fields.append("visitors")

        # Merge fresh over last-good; keep previous real values for stale fields.
        merged = {k: v for k, v in _SNAPSHOT.items() if k != "_meta"}
        merged.update({k: v for k, v in fresh.items() if v is not None})

        got_anything = bool(fresh)
        merged["_meta"] = {
            "available": bool(merged) and any(k != "_meta" for k in merged),
            "rate_limited": rate_limited,
            "token_expired": token_expired,
            "stale_fields": sorted(set(f for f in stale_fields if f in merged)),
            "last_updated": _iso_now(),
            "org_id": org,
        }
        if token_expired:
            merged["_meta"]["reason"] = "LinkedIn access token expired — reconnect in Settings."

        if got_anything:
            _SNAPSHOT = merged
            _LAST_FETCH_TS = time.time()
            _save_disk_cache()
            # Persist today's follower count for daily/weekly delta tracking.
            await self._maybe_persist_today(merged)
            return _SNAPSHOT

        # Nothing fresh at all (fully throttled). Return last-good, flagged stale.
        if _SNAPSHOT:
            # Even fully throttled, record today's row from the last real count
            # so the growth tracker keeps accumulating daily history.
            await self._maybe_persist_today(_SNAPSHOT)
            meta = dict(_SNAPSHOT.get("_meta", {}))
            meta.update({"rate_limited": rate_limited, "served_from_cache": True,
                         "stale_fields": [k for k in _SNAPSHOT if k != "_meta"]})
            return {**_SNAPSHOT, "_meta": meta}
        return {"_meta": {"available": False, "rate_limited": rate_limited,
                          "reason": "LinkedIn API throttled and no cached data yet"}}

    async def _maybe_persist_today(self, snap: dict) -> None:
        """Record today's full metric snapshot (followers + impressions +
        engagement + reactions…) from any snapshot (fresh OR cached) that carries
        a real `followers` value. The dashboard/reports trends read these rows, so
        this must run on every path — including throttled ones — or trends never
        accumulate. No-op when followers is absent."""
        followers = snap.get("followers")
        if followers is None:
            return
        try:
            await self._save_daily_snapshot(snap)
        except Exception as e:
            print(f"[LinkedIn] daily snapshot save failed: {e}")

    async def _save_daily_snapshot(self, snap: dict) -> None:
        """Upsert today's FollowerSnapshot row with the current real metrics.
        Updates in-place (last sync wins) and skips the write entirely when
        today's row already matches, so it is cheap to call on every poll."""
        from app.database import AsyncSessionLocal
        from app.models import FollowerSnapshot
        from sqlalchemy import select

        def _i(k):
            return int(snap.get(k) or 0)

        fields = {
            "followers": int(snap.get("followers") or 0),
            "organic_followers": _i("organic_followers"),
            "paid_followers": _i("paid_followers"),
            "impressions": _i("impressions"),
            "unique_impressions": _i("unique_impressions"),
            "clicks": _i("clicks"),
            "likes": _i("likes"),
            "comments": _i("comments"),
            "shares": _i("shares"),
            "visitors": _i("visitors"),
            "engagement_rate": float(snap.get("engagement_rate") or 0.0),
        }

        # Cumulative lifetime totals must never regress to 0: a throttled/partial
        # fetch that yields 0 for one of these must NOT overwrite a real value we
        # already recorded today, or the day-over-day delta charts get corrupted
        # (a spurious 0 makes the next real reading look like a giant one-day spike).
        _CUMULATIVE = {"followers", "organic_followers", "paid_followers", "impressions",
                       "unique_impressions", "clicks", "likes", "comments", "shares"}

        today = date.today()
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(FollowerSnapshot).where(FollowerSnapshot.snapshot_date == today)
            )
            row = result.scalar_one_or_none()
            if row is None:
                session.add(FollowerSnapshot(snapshot_date=today, **fields))
            else:
                changed = False
                for k, v in fields.items():
                    cur = getattr(row, k)
                    # Keep the existing real value instead of zeroing it out.
                    if k in _CUMULATIVE and (v or 0) == 0 and (cur or 0) > 0:
                        continue
                    if cur != v:
                        setattr(row, k, v)
                        changed = True
                if not changed:
                    return  # unchanged — nothing to write
            await session.commit()

    # ── individual fetchers (raise _Throttled on 429, _TokenExpired on 401) ──
    async def _fetch_share_stats(self, client: httpx.AsyncClient, token: str, org: str) -> dict:
        org_urn = f"urn:li:organization:{org}"
        resp = await self._authed_get(
            client,
            f"{self.base_url}/organizationalEntityShareStatistics",
            params={"q": "organizationalEntity", "organizationalEntity": org_urn},
        )
        elements = resp.json().get("elements", [])
        if not elements:
            return {}
        ts = elements[0].get("totalShareStatistics", {})
        eng = ts.get("engagement", 0.0) or 0.0
        return {
            "impressions": int(ts.get("impressionCount", 0) or 0),
            "unique_impressions": int(ts.get("uniqueImpressionsCount", 0) or 0),
            "clicks": int(ts.get("clickCount", 0) or 0),
            "likes": int(ts.get("likeCount", 0) or 0),
            "comments": int(ts.get("commentCount", 0) or 0),
            "shares": max(0, int(ts.get("shareCount", 0) or 0)),
            "engagement_rate": round(eng * 100, 2),
        }

    async def _fetch_follower_stats(self, client: httpx.AsyncClient, token: str, org: str) -> dict:
        org_urn = f"urn:li:organization:{org}"
        resp = await self._authed_get(
            client,
            f"{self.base_url}/organizationalEntityFollowerStatistics",
            params={"q": "organizationalEntity", "organizationalEntity": org_urn},
        )
        elements = resp.json().get("elements", [])
        if not elements:
            return {}
        item = elements[0]
        out: dict = {}

        total_fc = item.get("totalFollowerCounts") or {}
        if total_fc:
            organic = int(total_fc.get("organicFollowerCount", 0) or 0)
            paid = int(total_fc.get("paidFollowerCount", 0) or 0)
            out["organic_followers"] = organic
            out["paid_followers"] = paid
            out["followers"] = organic + paid

        # Real demographic breakdowns (only labels we can resolve offline).
        demographics: dict = {}
        seniority = _resolve_buckets(item.get("followerCountsBySeniority"), "seniority", _SENIORITY)
        if seniority:
            demographics["seniority"] = seniority
        function = _resolve_buckets(item.get("followerCountsByFunction"), "function", _FUNCTION)
        if function:
            demographics["function"] = function
        if demographics:
            out["demographics"] = demographics
        return out

    async def _fetch_follower_count(self, client: httpx.AsyncClient, token: str, org: str) -> int:
        org_urn = f"urn:li:organization:{org}"
        enc = urllib.parse.quote_plus(org_urn)
        resp = await self._authed_get(
            client,
            f"{self.base_url}/networkSizes/{enc}",
            params={"edgeType": "COMPANY_FOLLOWED_BY_MEMBER"},
        )
        return int(resp.json().get("firstDegreeSize", 0) or 0)

    async def _fetch_page_stats(self, client: httpx.AsyncClient, token: str, org: str) -> int:
        org_urn = f"urn:li:organization:{org}"
        resp = await self._authed_get(
            client,
            f"{self.base_url}/organizationPageStatistics",
            params={"q": "organization", "organization": org_urn},
        )
        elements = resp.json().get("elements", [])
        total = 0
        for el in elements:
            views = el.get("totalPageStatistics", {}).get("views", {})
            total += sum(v.get("pageViews", 0) for v in views.values() if isinstance(v, dict))
        return total

    # ──────────────────────────────────────────────────────────────────────────
    # Recent real posts published on the company page
    # ──────────────────────────────────────────────────────────────────────────
    async def get_org_posts(self, count: int = 20) -> dict:
        """Return recent real posts from the company page (content + link only —
        per-post engagement metrics require Community-Management access we lack).

        Cached: the /posts endpoint is quota-limited, so we serve the last good list
        without touching LinkedIn while it's fresh, and — critically — keep serving
        it (flagged) when a re-fetch is throttled, instead of blanking to
        "Posts syncing". Only a genuinely empty first fetch shows the empty state.
        """
        global _POSTS_CACHE, _POSTS_FETCH_TS, _POSTS_429_UNTIL
        if not self._has_credentials():
            return {"available": False, "posts": []}
        _load_disk_cache()

        now = time.time()
        cached = _POSTS_CACHE.get("posts") if _POSTS_CACHE else None
        # Fresh cache → no LinkedIn call at all (protects the daily quota).
        if cached and (now - _POSTS_FETCH_TS) < _POSTS_TTL_SECONDS:
            return {**_POSTS_CACHE, "served_from_cache": True}

        # Recently throttled → don't keep hitting /posts on every poll while LinkedIn
        # is rate-limiting (that only delays quota recovery). Serve last-good if we
        # have it; otherwise report syncing, both without a network round-trip.
        if now < _POSTS_429_UNTIL:
            if cached:
                return {**_POSTS_CACHE, "rate_limited": True, "served_from_cache": True}
            return {"available": False, "rate_limited": True, "posts": []}

        token = self._access_token()
        org = settings.LINKEDIN_ORG_ID
        org_urn = f"urn:li:organization:{org}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{self.base_url}/posts",
                    headers=self._auth_headers(token=token),
                    params={"q": "author", "author": org_urn, "count": count},
                )
                if resp.status_code == 429:
                    # Throttled: back off, and keep showing the last real posts
                    # rather than blanking.
                    _POSTS_429_UNTIL = now + _POSTS_BACKOFF_SECONDS
                    if cached:
                        return {**_POSTS_CACHE, "rate_limited": True, "served_from_cache": True}
                    return {"available": False, "rate_limited": True, "posts": []}
                resp.raise_for_status()
                data = resp.json()
                posts = []
                for el in data.get("elements", []):
                    urn = el.get("id", "")
                    posts.append({
                        "urn": urn,
                        "content": el.get("commentary", ""),
                        "published_at": el.get("publishedAt"),
                        "url": f"https://www.linkedin.com/feed/update/{urn}" if urn else None,
                        "has_media": bool(el.get("content", {}).get("media")),
                    })
                result = {"available": True, "total": data.get("paging", {}).get("total", len(posts)), "posts": posts}
                if posts:  # only cache a non-empty result as "last good"
                    _POSTS_CACHE = result
                    _POSTS_FETCH_TS = now
                    _save_disk_cache()
                return result
        except Exception as e:
            print(f"LinkedIn posts fetch error: {e}")
            # Transient error → keep the last good posts if we have them.
            if cached:
                return {**_POSTS_CACHE, "served_from_cache": True, "stale": True}
            return {"available": False, "posts": []}

    # ──────────────────────────────────────────────────────────────────────────
    # Connectivity test (used by settings/linkedin-status)
    # ──────────────────────────────────────────────────────────────────────────
    async def test_connection(self) -> dict:
        """Validate the token via introspection (cheap, not day-throttled)."""
        token = self._access_token()
        org = settings.LINKEDIN_ORG_ID
        if not token:
            return {"connected": False, "error": "No access token configured"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            # Token introspection is the reliable, non-throttled health check.
            try:
                intro = await client.post(
                    "https://www.linkedin.com/oauth/v2/introspectToken",
                    data={
                        "client_id": settings.LINKEDIN_CLIENT_ID,
                        "client_secret": settings.LINKEDIN_CLIENT_SECRET,
                        "token": token,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if intro.status_code == 200:
                    d = intro.json()
                    active = d.get("active") and d.get("status") == "active"
                    if not active:
                        return {"connected": False, "error": f"Token status: {d.get('status', 'inactive')}"}
                    return {
                        "connected": True,
                        "account_name": f"Org {org}" if org else "LinkedIn",
                        "org_id": org,
                        "scopes": d.get("scope", ""),
                        "expires_at": d.get("expires_at"),
                    }
            except Exception as e:
                print(f"LinkedIn introspection error: {e}")

            # Fallback: try org lookup (may be day-throttled → treat 429 as "connected").
            if org:
                r = await client.get(f"{self.base_url}/organizations/{org}", headers=self._auth_headers())
                if r.status_code == 200:
                    name = r.json().get("localizedName", f"Org {org}")
                    return {"connected": True, "account_name": name, "org_id": org}
                if r.status_code == 429:
                    return {"connected": True, "account_name": f"Org {org}", "org_id": org, "rate_limited": True}
                return {"connected": False, "error": f"Org HTTP {r.status_code}: {r.text[:180]}"}
            return {"connected": False, "error": "Token could not be validated"}


# ── helpers ─────────────────────────────────────────────────────────────────
class _Throttled(Exception):
    """Raised when a LinkedIn endpoint returns HTTP 429 (daily quota reached)."""


class _TokenExpired(Exception):
    """Raised when a LinkedIn endpoint returns HTTP 401 and the token could not
    be refreshed — the integration needs to be reconnected."""


def _iso_now() -> str:
    # time.gmtime avoids importing datetime just for a timestamp string.
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _resolve_buckets(buckets, urn_kind: str, label_map: dict) -> list:
    """Turn LinkedIn's URN-keyed follower buckets into labelled {name,value} rows.
    Buckets whose URN we can't resolve offline are skipped (never shown raw)."""
    if not buckets:
        return []
    rows = []
    for b in buckets:
        urn = b.get(urn_kind, "")
        code = urn.rsplit(":", 1)[-1] if urn else ""
        label = label_map.get(code)
        if not label:
            continue
        counts = b.get("followerCounts", {}) or {}
        value = int(counts.get("organicFollowerCount", 0) or 0) + int(counts.get("paidFollowerCount", 0) or 0)
        if value > 0:
            rows.append({"name": label, "value": value})
    rows.sort(key=lambda r: r["value"], reverse=True)
    return rows


linkedin_service = LinkedInService()

# Prefer a previously auto-refreshed token over the .env seed on startup.
_load_persisted_token()
