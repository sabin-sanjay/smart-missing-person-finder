"""
run_public.py: start the backend AND put it on the internet for free.

What it does, in order:
  1. Starts the backend server on this laptop (port 8000).
  2. Starts a free Cloudflare "quick tunnel", which gives the backend a
     public https:// address that phones anywhere can reach.
  3. Writes that address into Supabase (table app_config, key backend_url),
     so the app always knows where the backend is. The address changes every
     time, which is why we publish it instead of typing it into the app.
  4. Keeps running. Press Ctrl+C to stop everything.

Push alerts and photo scanning run inside the backend every 2 minutes,
so they work as long as this window stays open.

Run it (from the backend folder):
  .venv\\Scripts\\python.exe run_public.py
or just double-click  start-backend.cmd  in the main project folder.
"""

import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
PORT = 8000


def find_cloudflared() -> str | None:
    """Look for the cloudflared program in the usual places."""
    found = shutil.which("cloudflared")
    if found:
        return found
    for candidate in (
        HERE / "tools" / "cloudflared.exe",
        Path(r"C:\Program Files (x86)\cloudflared\cloudflared.exe"),
        Path(r"C:\Program Files\cloudflared\cloudflared.exe"),
        Path(os.getenv("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "cloudflared.exe",
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def publish_address(url: str) -> None:
    """Save the backend's public address in Supabase so the app can find it."""
    headers = {
        "apikey": SECRET_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates",
    }
    if not SECRET_KEY.startswith("sb_"):  # older JWT-style keys also need this header
        headers["Authorization"] = f"Bearer {SECRET_KEY}"
    r = httpx.post(
        f"{SUPABASE_URL}/rest/v1/app_config?on_conflict=key",
        headers=headers,
        json={"key": "backend_url", "value": url,
              "updated_at": datetime.now(timezone.utc).isoformat()},
        timeout=20,
    )
    r.raise_for_status()


def main() -> None:
    if not (SUPABASE_URL and SECRET_KEY):
        sys.exit("backend/.env is missing SUPABASE_URL or SUPABASE_SECRET_KEY.")

    cloudflared = find_cloudflared()
    if not cloudflared:
        sys.exit(
            "cloudflared is not installed.\n"
            "Install it once by running this in a terminal, then try again:\n"
            "  winget install --id Cloudflare.cloudflared"
        )

    env = dict(os.environ, PYTHONIOENCODING="utf-8")

    # 1. The backend server
    print(f"Starting the backend on http://localhost:{PORT} ...")
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
        cwd=HERE, env=env,
    )

    # 2. The tunnel. cloudflared prints its address in its log output.
    print("Opening a free Cloudflare tunnel ...")
    tunnel = subprocess.Popen(
        [cloudflared, "tunnel", "--no-autoupdate", "--url", f"http://localhost:{PORT}"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
    )

    found = threading.Event()

    def watch_tunnel_output() -> None:
        for line in tunnel.stdout:
            match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if match and not found.is_set():
                url = match.group(0)
                found.set()
                # 3. Tell the app where we are (retry a few times in case the internet is slow)
                for attempt in range(5):
                    try:
                        publish_address(url)
                        break
                    except Exception as e:
                        print(f"  could not save the address yet ({e}); retrying ...")
                        time.sleep(3)
                print()
                print("=" * 64)
                print("  ✅ Backend is ONLINE at:")
                print(f"     {url}")
                print("  The app has been told this address automatically.")
                print("  Keep this window open. Press Ctrl+C to stop.")
                print("=" * 64)
                print()

    threading.Thread(target=watch_tunnel_output, daemon=True).start()

    def stop(*_):
        print("\nStopping ...")
        try:
            publish_address("")  # tell the app the backend is off
        except Exception:
            pass
        for p in (tunnel, server):
            if p.poll() is None:
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    if not found.wait(timeout=60):
        print("⚠️  The tunnel did not give an address within 60 seconds. Check your internet.")

    # 4. Keep running until Ctrl+C (or until the server stops by itself)
    while server.poll() is None and tunnel.poll() is None:
        time.sleep(1)
    print("The backend or the tunnel stopped unexpectedly.")
    stop()


if __name__ == "__main__":
    main()
