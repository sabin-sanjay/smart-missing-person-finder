"""
sms.py: SMS fallback, for people whose phone couldn't get a push notification.

SMS_PROVIDER in .env picks how:
  "log"      -> just print the message in the terminal (free, for testing)
  "fast2sms" -> Fast2SMS (India)
  "twilio"   -> Twilio
"""

import logging
import re

import httpx

from . import config

log = logging.getLogger("sms")


def _ten_digits(phone: str) -> str:
    """'+91 98765-43210' -> '9876543210'"""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:]


async def send_sms(phone: str, text: str) -> tuple[bool, str | None]:
    """Send one SMS. Returns (worked?, error message or None)."""
    number = _ten_digits(phone)
    if len(number) != 10:
        return False, "invalid phone number"

    try:
        if config.SMS_PROVIDER == "fast2sms":
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://www.fast2sms.com/dev/bulkV2",
                    headers={"authorization": config.FAST2SMS_API_KEY},
                    json={"route": "q", "message": text, "numbers": number, "flash": 0},
                )
            data = r.json()
            if r.status_code == 200 and data.get("return") is True:
                return True, None
            return False, str(data.get("message", r.text))[:300]

        if config.SMS_PROVIDER == "twilio":
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json",
                    auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN),
                    data={"To": f"+91{number}", "From": config.TWILIO_FROM_NUMBER, "Body": text},
                )
            if r.status_code in (200, 201):
                return True, None
            return False, r.text[:300]

        # Default: "log" mode, so nothing is really sent
        log.info("[SMS not really sent: SMS_PROVIDER=log] to %s: %s", number, text)
        return True, "log mode (not really sent)"

    except Exception as e:  # network problems etc.
        return False, str(e)[:300]
