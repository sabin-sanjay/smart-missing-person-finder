"""
privacy.py: keeping only what's needed (India's DPDP Act: personal data
should not be kept longer than its purpose needs).

1. cleanup_once(): every few hours, for cases closed (found or rejected) more
   than KEEP_DAYS ago:
     - delete the case photo, extra photos and sighting photos from storage
     - remove the description, address, sighting notes, messages and the
       face "fingerprints" (embeddings)
   The case itself stays as a bare record (name, dates, status) so the
   statistics and the police history still add up.
   Found-person reports that are matched or closed are deleted completely.
   SWITCHED OFF BY DEFAULT: it only runs when backend/.env has
   PRIVACY_CLEANUP=on (deleting data is the project owner's decision).

2. delete_account(user_id): a user removes their own account. Their alert
   subscriptions go, their profile and login are deleted; cases they
   reported stay (for the police) but are no longer linked to them.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

import httpx

from . import config
from . import supabase_client as db

log = logging.getLogger("privacy")
KEEP_DAYS = 30
EVERY_SECONDS = 6 * 3600
_last_run = 0.0


async def _remove_files(bucket: str, paths: list[str]) -> None:
    paths = [p for p in paths if p]
    if not paths:
        return
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.request("DELETE", f"{config.SUPABASE_URL}/storage/v1/object/{bucket}",
                            headers=db._headers(), json={"prefixes": paths})
        r.raise_for_status()


async def _patch(table: str, query: str, values: dict) -> None:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.patch(f"{config.SUPABASE_URL}/rest/v1/{table}?{query}",
                          headers=db._headers({"Prefer": "return=minimal"}), json=values)
        r.raise_for_status()


async def _delete(table: str, query: str) -> None:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.delete(f"{config.SUPABASE_URL}/rest/v1/{table}?{query}", headers=db._headers())
        r.raise_for_status()


async def cleanup_once(force: bool = False) -> dict:
    """Runs at most every 6 hours (unless force=True)."""
    global _last_run
    if not config.PRIVACY_CLEANUP:
        return {"off": True}  # turned off (default) - see the note at the top
    if not db.is_configured():
        return {"error": "Supabase is not configured."}
    if not force and time.time() - _last_run < EVERY_SECONDS:
        return {"skipped": True}
    _last_run = time.time()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat()
    cases = await db.select(
        "missing_persons",
        f"select=id,photo_path&status=in.(found,rejected)&updated_at=lt.{cutoff}"
        "&or=(photo_path.not.is.null,description.not.is.null,last_seen_address.not.is.null)&limit=200",
    )
    ids = [c["id"] for c in cases]
    if ids:
        id_list = ",".join(ids)
        extra = await db.select("case_photos", f"select=photo_path&case_id=in.({id_list})")
        sight = await db.select("sightings", f"select=photo_path&case_id=in.({id_list})&photo_path=not.is.null")
        await _remove_files("case-photos", [c["photo_path"] for c in cases] + [p["photo_path"] for p in extra])
        await _remove_files("sighting-photos", [s["photo_path"] for s in sight])
        await _delete("case_photos", f"case_id=in.({id_list})")
        await _delete("case_faces", f"case_id=in.({id_list})")
        await _delete("case_messages", f"case_id=in.({id_list})")
        await _patch("sightings", f"case_id=in.({id_list})", {"photo_path": None, "notes": None})
        await _patch("missing_persons", f"id=in.({id_list})",
                     {"photo_path": None, "description": None, "last_seen_address": None})

    found = await db.select("found_persons",
                            f"select=id,photo_path&status=in.(matched,closed)&created_at=lt.{cutoff}&limit=200")
    if found:
        await _remove_files("found-photos", [f["photo_path"] for f in found])
        await _delete("found_persons", f"id=in.({','.join(f['id'] for f in found)})")

    summary = {"cases_cleaned": len(ids), "found_reports_deleted": len(found)}
    if ids or found:
        log.info("Privacy clean-up: %s", summary)
    return summary


async def delete_account(user_id: str) -> None:
    """Delete one user's account (they asked for it themselves)."""
    await _delete("alert_subscriptions", f"user_id=eq.{user_id}")
    # Deleting the login also deletes the profile (cascade); cases they
    # reported stay for the police, with reported_by set to empty.
    async with httpx.AsyncClient(timeout=30) as c:
        headers = db._headers()
        headers.setdefault("Authorization", f"Bearer {config.SUPABASE_SECRET_KEY}")
        r = await c.delete(f"{config.SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=headers)
        r.raise_for_status()
