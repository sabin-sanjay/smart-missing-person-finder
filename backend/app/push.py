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
        messages = [
            messaging.Message(
                token=item["token"],
                # "data" messages: our service worker builds the notification itself.
                # All values must be text.
                data={k: str(item.get(k) or "") for k in ("title", "body", "url", "image", "tag")},
                webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "86400"}),
            )
            for item in batch
        ]
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
