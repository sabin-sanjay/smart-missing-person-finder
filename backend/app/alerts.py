"""
alerts.py: the geo-targeted alert logic.

Every time run_alerts_once() runs (every 2 minutes by default):
  1. Grow alert circles that have waited long enough: 2 km -> 5 km -> 10 km
  2. Ask the database: which phones are inside an active case's circle
     and haven't been alerted for that case yet?
  3. Send each one a push notification
  4. If push fails (or the user has no push), send an SMS if they gave a phone number
  5. Write everything to alert_log so nobody gets the same alert twice
Cases marked "found" are skipped by the database, so their alerts stop.
"""

import asyncio
import logging
from datetime import datetime, timezone

from . import config, messages, push, sms
from . import supabase_client as db

log = logging.getLogger("alerts")
_lock = asyncio.Lock()  # stops two runs happening at the same time


async def _languages() -> dict[str, str]:
    """push token -> language, for every phone that chose a language other than English."""
    try:
        rows = await db.select("alert_subscriptions", "select=fcm_token,language&language=neq.en&fcm_token=not.is.null")
        return {r["fcm_token"]: r["language"] for r in rows}
    except Exception:
        return {}  # (before supabase/013 is run there is no language column: use English)


def _minutes_since(iso_text: str) -> int:
    seen = datetime.fromisoformat(iso_text.replace("Z", "+00:00"))
    return int((datetime.now(timezone.utc) - seen).total_seconds() // 60)


def _time_ago(iso_text: str) -> str:
    seen = datetime.fromisoformat(iso_text.replace("Z", "+00:00"))
    minutes = int((datetime.now(timezone.utc) - seen).total_seconds() // 60)
    if minutes < 60:
        return f"{max(minutes, 1)} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    return f"{days} day{'s' if days != 1 else ''} ago"


def _photo_url(photo_path: str | None) -> str:
    if not photo_path:
        return ""
    return f"{config.SUPABASE_URL}/storage/v1/object/public/case-photos/{photo_path}"


def _push_text(r: dict, lang: str = "en") -> dict:
    name = r["full_name"] + (f", {r['age']}" if r.get("age") is not None else "")
    place = messages.text("near", lang, place=r["last_seen_address"]) if r.get("last_seen_address") else ""
    return {
        "token": r["fcm_token"],
        "title": messages.text("alert_title", lang, name=name),
        "body": messages.text("alert_body", lang, ago=messages.time_ago(_minutes_since(r["last_seen_at"]), lang),
                              place=place, km=f"{r['distance_km']:.1f}"),
        "url": f"{config.APP_URL}/case/{r['case_id']}",
        "image": _photo_url(r.get("photo_path")),
        "tag": f"case-{r['case_id']}",  # a newer alert for the same case replaces the old one
    }


def _sms_text(r: dict) -> str:
    # Plain English letters only: emoji or other scripts make SMS cost more
    name = r["full_name"] + (f", {r['age']}" if r.get("age") is not None else "")
    place = f" near {r['last_seen_address']}" if r.get("last_seen_address") else ""
    return (
        f"LUMEN - MISSING PERSON ALERT: {name}. Last seen {r['distance_km']:.1f} km from you{place}. "
        f"Seen them? {config.APP_URL}/case/{r['case_id']} or call 112"
    )


async def run_alerts_once() -> dict:
    """Do one round of alerts. Returns counts, for the logs / API response."""
    if not db.is_configured():
        return {"error": "Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)."}

    async with _lock:
        # 1) Grow circles that have waited long enough
        await db.rpc(
            "advance_alert_radii",
            {"p_to5_minutes": config.EXPAND_TO_5KM_AFTER_MIN, "p_to10_minutes": config.EXPAND_TO_10KM_AFTER_MIN},
        )

        # 2) Who needs an alert?
        rows = await db.rpc("pending_alert_recipients", {"p_limit": 500}) or []
        if not rows:
            return {"recipients": 0, "push_sent": 0, "sms_sent": 0, "failed": 0}

        logs: list[dict] = []
        invalid_subscriptions: list[str] = []
        needs_sms: list[tuple[dict, str | None]] = []

        def add_log(r: dict, channel: str, error: str | None = None):
            logs.append({
                "case_id": r["case_id"],
                "subscription_id": r["subscription_id"],
                "user_id": r["user_id"],
                "channel": channel,
                "radius_km": r["alert_radius_km"],
                "error": error,
            })

        # 3) Push notifications. firebase-admin is not async, so it runs in a thread.
        push_rows = [r for r in rows if r.get("fcm_token")]
        langs = await _languages()
        results = await asyncio.to_thread(push.send_many, [_push_text(r, langs.get(r["fcm_token"], "en")) for r in push_rows])
        for r, res in zip(push_rows, results):
            if res["ok"]:
                add_log(r, "push")
            else:
                if res["token_invalid"]:
                    invalid_subscriptions.append(r["subscription_id"])
                needs_sms.append((r, res["error"]))

        # People who never had push (SMS-only rows)
        needs_sms += [(r, "no push token") for r in rows if not r.get("fcm_token")]

        # 4) SMS fallback: at most one SMS per person per case
        texted: set[tuple[str, str]] = set()
        for r, push_error in needs_sms:
            key = (r["case_id"], r["user_id"])
            if not r.get("phone"):
                add_log(r, "failed", f"push failed ({push_error}); no phone number for SMS")
            elif r.get("sms_already_sent") or key in texted:
                add_log(r, "sms", "SMS already sent to this person for this case")
            else:
                ok, sms_error = await sms.send_sms(r["phone"], _sms_text(r))
                texted.add(key)
                add_log(r, "sms" if ok else "failed", sms_error if ok else f"push: {push_error}; sms: {sms_error}")

        # 5) Save the log FIRST, then remove dead push tokens
        await db.insert("alert_log", logs, on_conflict="case_id,subscription_id")
        await db.delete_by_ids("alert_subscriptions", invalid_subscriptions)

        summary = {
            "recipients": len(rows),
            "push_sent": sum(1 for l in logs if l["channel"] == "push"),
            "sms_sent": len(texted),
            "failed": sum(1 for l in logs if l["channel"] == "failed"),
            "dead_tokens_removed": len(invalid_subscriptions),
        }
        log.info("Alert round: %s", summary)
        return summary


async def run_found_notices_once() -> dict:
    """
    "Reunited" round: for cases the police just marked FOUND, tell the family
    and everyone who got an alert that the person has been found (once).
    """
    if not db.is_configured():
        return {"error": "Supabase is not configured."}

    rows = await db.rpc("pending_found_notices", {"p_limit": 500}) or []
    if not rows:
        return {"cases": 0, "push_sent": 0}

    with_phone = [r for r in rows if r.get("fcm_token")]
    langs = await _languages()
    msgs = [{
        "token": r["fcm_token"],
        "title": messages.text("found_title", langs.get(r["fcm_token"]), name=r["full_name"]),
        "body": messages.text("found_body", langs.get(r["fcm_token"])),
        "url": f"{config.APP_URL}/case/{r['case_id']}",
        "tag": f"case-{r['case_id']}",  # replaces the old "missing" alert on the phone
    } for r in with_phone]
    results = await asyncio.to_thread(push.send_many, msgs) if msgs else []

    # Mark every case as announced, even if nobody had a phone to tell
    case_ids = sorted({r["case_id"] for r in rows})
    await db.rpc("mark_found_notified", {"p_ids": case_ids})

    summary = {"cases": len(case_ids), "push_sent": sum(1 for x in results if x["ok"])}
    log.info("Found notices: %s", summary)
    return summary



async def run_sighting_notices_once() -> dict:
    """
    Family updates: when someone reports a sighting, tell the family who
    registered the case (once per sighting).
    """
    if not db.is_configured():
        return {"error": "Supabase is not configured."}
    rows = await db.rpc("pending_sighting_notices", {"p_limit": 200}) or []
    if not rows:
        return {"sightings": 0, "push_sent": 0}

    langs = await _languages()
    msgs = [{
        "token": r["fcm_token"],
        "title": messages.text("sighting_title", langs.get(r["fcm_token"]), name=r["full_name"]),
        "body": messages.text("sighting_body", langs.get(r["fcm_token"])),
        "url": f"{config.APP_URL}/case/{r['case_id']}",
        "tag": f"sighting-{r['sighting_id']}",
    } for r in rows if r.get("fcm_token")]
    results = await asyncio.to_thread(push.send_many, msgs) if msgs else []

    ids = sorted({r["sighting_id"] for r in rows})
    await db.rpc("mark_sighting_notified", {"p_ids": ids})
    summary = {"sightings": len(ids), "push_sent": sum(1 for x in results if x["ok"])}
    log.info("Sighting notices: %s", summary)
    return summary


async def run_match_notices_once() -> dict:
    """
    "Found someone" matches: when the AI finds a likely match (70%+), tell
    every police/admin phone and the person who registered the found person.
    """
    if not db.is_configured():
        return {"error": "Supabase is not configured."}
    rows = await db.rpc("pending_match_notices", {"p_limit": 200}) or []
    if not rows:
        return {"matches": 0, "push_sent": 0}

    langs = await _languages()
    msgs = []
    for r in rows:
        if not r.get("fcm_token"):
            continue
        pct = round(float(r["score"]) * 100)
        lang = langs.get(r["fcm_token"])
        if r["for_finder"]:
            msgs.append({
                "token": r["fcm_token"],
                "title": messages.text("match_finder_title", lang),
                "body": messages.text("match_finder_body", lang, name=r["full_name"], pct=pct),
                "url": f"{config.APP_URL}/found-someone",
                "tag": f"found-{r['found_id']}",
            })
        else:
            msgs.append({
                "token": r["fcm_token"],
                "title": messages.text("match_police_title", lang, name=r["full_name"]),
                "body": messages.text("match_police_body", lang, pct=pct),
                "url": f"{config.APP_URL}/police/found",
                "tag": f"found-{r['found_id']}",
            })
    results = await asyncio.to_thread(push.send_many, msgs) if msgs else []

    ids = sorted({r["found_id"] for r in rows})
    await db.rpc("mark_match_notified", {"p_ids": ids})
    summary = {"matches": len(ids), "push_sent": sum(1 for x in results if x["ok"])}
    log.info("Match notices: %s", summary)
    return summary
