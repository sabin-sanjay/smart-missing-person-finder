"""
supabase_client.py: small helpers to talk to our Supabase database
using its REST API and the SECRET key (which skips the security rules,
so this code must only ever run on the server).
"""

import httpx

from . import config


def _headers(extra: dict | None = None) -> dict:
    headers = {"apikey": config.SUPABASE_SECRET_KEY, "Content-Type": "application/json"}
    # Older "service_role" keys are JWTs and also go in the Authorization header.
    # New "sb_secret_..." keys only go in "apikey".
    if not config.SUPABASE_SECRET_KEY.startswith("sb_"):
        headers["Authorization"] = f"Bearer {config.SUPABASE_SECRET_KEY}"
    if extra:
        headers.update(extra)
    return headers


def is_configured() -> bool:
    return bool(config.SUPABASE_URL and config.SUPABASE_SECRET_KEY)


async def rpc(function_name: str, params: dict | None = None):
    """Call a database function, e.g. rpc('pending_alert_recipients', {'p_limit': 500})."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{config.SUPABASE_URL}/rest/v1/rpc/{function_name}",
            headers=_headers(),
            json=params or {},
        )
        r.raise_for_status()
        return r.json() if r.content else None


async def insert(table: str, rows: list[dict], on_conflict: str | None = None) -> None:
    """Insert rows. If on_conflict is given, rows that already exist are skipped."""
    if not rows:
        return
    url = f"{config.SUPABASE_URL}/rest/v1/{table}"
    prefer = "return=minimal"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
        prefer += ",resolution=ignore-duplicates"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, headers=_headers({"Prefer": prefer}), json=rows)
        r.raise_for_status()


async def upsert(table: str, row: dict, on_conflict: str) -> None:
    """Insert a row, or update it if one with the same key already exists."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{config.SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
            headers=_headers({"Prefer": "return=minimal,resolution=merge-duplicates"}),
            json=row,
        )
        r.raise_for_status()


async def update_by_id(table: str, row_id: str, values: dict) -> None:
    """Change some columns of one row."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.patch(
            f"{config.SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}",
            headers=_headers({"Prefer": "return=minimal"}),
            json=values,
        )
        r.raise_for_status()


async def download_photo(bucket: str, path: str) -> bytes:
    """Download a photo from Storage (works for private buckets too, thanks to the secret key)."""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{path}", headers=_headers())
        r.raise_for_status()
        return r.content


async def get_user_from_token(access_token: str) -> dict | None:
    """
    Check a logged-in user's access token (sent by the app) with Supabase.
    Returns the user (id, email...) if the token is valid, otherwise None.
    """
    if not access_token or not is_configured():
        return None
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={"apikey": config.SUPABASE_SECRET_KEY, "Authorization": f"Bearer {access_token}"},
        )
    return r.json() if r.status_code == 200 else None


async def delete_by_ids(table: str, ids: list[str]) -> None:
    """Delete rows whose id is in the list."""
    if not ids:
        return
    id_list = ",".join(ids)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.delete(
            f"{config.SUPABASE_URL}/rest/v1/{table}?id=in.({id_list})",
            headers=_headers(),
        )
        r.raise_for_status()
