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

from . import config, push, sms
from . import supabase_client as db

log = logging.getLogger("alerts")
_lock = asyncio.Lock()  # stops two runs happening at the same time


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


def _push_text(r: dict) -> dict:
    name = r["full_name"] + (f", {r['age']}" if r.get("age") is not None else "")
    place = f" near {r['last_seen_address']}" if r.get("last_seen_address") else ""
    return {
        "token": r["fcm_token"],
        "title": f"🚨 Missing: {name}",
        "body": (
            f"Last seen {_time_ago(r['last_seen_at'])}{place}, {r['distance_km']:.1f} km from you. "
            "Tap to see the photo or report a sighting."
        ),
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
        results = await asyncio.to_thread(push.send_many, [_push_text(r) for r in push_rows])
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
