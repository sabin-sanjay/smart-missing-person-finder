"""
config.py: reads all settings from environment variables.

On your computer they come from the backend/.env file.
On Hugging Face Spaces they come from the Space's "Secrets" settings.
Secrets are NEVER written directly in the code.
"""

import os

from dotenv import load_dotenv

load_dotenv()  # loads backend/.env if it exists (does nothing on the server)


def _int(name: str, default: int) -> int:
    """Read a whole-number setting, falling back to a default."""
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")

# Firebase: either the JSON text itself, or the name of the .json file
FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
FIREBASE_SERVICE_ACCOUNT_FILE = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "")

# The website address, used for links in alerts
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")

# Password required to call /alerts/run
CRON_SECRET = os.getenv("CRON_SECRET", "")

# Alert timing
EXPAND_TO_5KM_AFTER_MIN = _int("EXPAND_TO_5KM_AFTER_MIN", 30)
EXPAND_TO_10KM_AFTER_MIN = _int("EXPAND_TO_10KM_AFTER_MIN", 60)
ALERT_LOOP_SECONDS = _int("ALERT_LOOP_SECONDS", 120)

# Face detection method used by DeepFace before matching.
# "opencv" is fastest and lightest; "retinaface" is more accurate but slower.
FACE_DETECTOR = os.getenv("FACE_DETECTOR", "opencv")

# SMS
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "log").lower()
FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")


# "Still missing" reminder: minutes after approval (and between reminders).
# 1440 = once a day. For a quick demo you can set e.g. REMINDER_AFTER_MIN=5 in .env
REMINDER_AFTER_MIN = int(os.getenv("REMINDER_AFTER_MIN", "1440"))


# Automatic privacy clean-up of closed cases older than 30 days (app/privacy.py).
# OFF unless you set PRIVACY_CLEANUP=on in .env.
PRIVACY_CLEANUP = os.getenv("PRIVACY_CLEANUP", "off").lower() in ("on", "1", "true", "yes")
