"""
push.py: sends web push notifications through Firebase Cloud Messaging (FCM).
"""

import json
import logging
import os

import firebase_admin
from firebase_admin import credentials, exceptions, messaging

from . import config

log = logging.getLogger("push")
_ready = False


def init() -> None:
    """Log in to Firebase with the service-account key (once, at startup)."""
    global _ready
    try:
        if config.FIREBASE_SERVICE_ACCOUNT_JSON:
            cred = credentials.Certificate(json.loads(config.FIREBASE_SERVICE_ACCOUNT_JSON))
        elif config.FIREBASE_SERVICE_ACCOUNT_FILE and os.path.exists(config.FIREBASE_SERVICE_ACCOUNT_FILE):
            cred = credentials.Certificate(config.FIREBASE_SERVICE_ACCOUNT_FILE)
        else:
            log.warning("Firebase is not configured: push notifications are OFF.")
            return
        firebase_admin.initialize_app(cred)
        _ready = True
        log.info("Firebase ready: push notifications are ON.")
    except Exception as e:  # bad JSON, wrong file, etc.
        log.error("Could not start Firebase: %s", e)


def is_ready() -> bool:
    return _ready


def _build_message(item: dict) -> "messaging.Message":
    """
    One alert for one phone.

    We include a ready-made "notification" (title + text) so the phone's browser
    shows it by itself. iPhones need this: they drop "silent" data-only
    messages. The same values also go in "data" for our own app code.
    """
    url = str(item.get("url") or "")
    return messaging.Message(
        token=item["token"],
        data={k: str(item.get(k) or "") for k in ("title", "body", "url", "image", "tag")},  # all text
        webpush=messaging.WebpushConfig(
            headers={"Urgency": "high", "TTL": "86400"},
            notification=messaging.WebpushNotification(
                title=item.get("title") or "Missing person alert",
                body=item.get("body") or "",
                icon="/pwa-192x192.png",
                image=item.get("image") or None,   # the person's photo (Android/desktop)
                tag=item.get("tag") or None,       # a newer alert for the same case replaces the old one
                renotify=True,
                require_interaction=True,          # stays on screen until tapped
            ),
            # Where tapping the notification goes. Firebase only accepts https:// links,
            # so this is skipped while testing on http://localhost.
            fcm_options=messaging.WebpushFCMOptions(link=url) if url.startswith("https://") else None,
        ),
    )


def send_many(items: list[dict]) -> list[dict]:
    """
    Send one notification per item. Each item: {token, title, body, url, image, tag}.
    Returns one result per item: {ok: bool, error: str|None, token_invalid: bool}
    """
    if not _ready:
        return [{"ok": False, "error": "push not configured", "token_invalid": False} for _ in items]

    results: list[dict] = []
    # Firebase accepts at most 500 messages per batch
    for start in range(0, len(items), 500):
        batch = items[start : start + 500]
        messages = [_build_message(item) for item in batch]
        response = messaging.send_each(messages)
        for r in response.responses:
            if r.success:
                results.append({"ok": True, "error": None, "token_invalid": False})
            else:
                exc = r.exception
                # These errors mean the phone uninstalled / turned off notifications
                invalid = isinstance(
                    exc,
                    (messaging.UnregisteredError, messaging.SenderIdMismatchError, exceptions.InvalidArgumentError),
                )
                results.append({"ok": False, "error": str(exc)[:300], "token_invalid": invalid})
    return results
