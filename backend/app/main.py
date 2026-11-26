"""
main.py: the backend's front door (a FastAPI web server).

Addresses ("endpoints"):
  GET  /              -> health check: is everything set up?
  POST /worker/run    -> do one round of face matching + alerts (needs X-Cron-Secret)
  POST /alerts/run    -> do one round of alerts only (needs X-Cron-Secret)
  POST /faces/search  -> "Who is this?": compare a photo with all active cases
                         (needs a logged-in user's token)
  GET  /docs          -> an automatic test page where you can try the endpoints

Start it on your computer (from the backend folder, with the venv active):
  uvicorn app.main:app --reload --port 8000
"""

import asyncio
import logging
import secrets
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import alerts, config, face_jobs, faces, push
from . import supabase_client as db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("main")

_worker_lock = asyncio.Lock()  # only one worker round at a time


async def run_worker_once() -> dict:
    """One round of all background work: faces first (so scores are ready), then alerts."""
    async with _worker_lock:
        result = {}
        for name, job in (("faces", face_jobs.run_face_jobs_once), ("alerts", alerts.run_alerts_once)):
            try:
                result[name] = await job()
            except Exception as e:
                log.exception("%s round failed", name)
                result[name] = {"error": str(e)[:300]}
        return result


async def worker_loop() -> None:
    """Runs forever in the background, every ALERT_LOOP_SECONDS."""
    while True:
        await run_worker_once()
        await asyncio.sleep(config.ALERT_LOOP_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once when the server starts (before 'yield') and once when it stops."""
    push.init()
    asyncio.get_running_loop().run_in_executor(None, faces.warm_up_in_background)
    task = asyncio.create_task(worker_loop()) if config.ALERT_LOOP_SECONDS > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Smart Missing Person Finder: backend", lifespan=lifespan)

# Which websites may call this backend from a browser: our app, plus local
# testing addresses (localhost and home Wi-Fi addresses like 192.168.x.x).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.APP_URL],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_cron_secret(given: str) -> None:
    if not config.CRON_SECRET:
        raise HTTPException(503, "CRON_SECRET is not set on the server.")
    # compare_digest compares safely, without leaking hints about the password
    if not secrets.compare_digest(given, config.CRON_SECRET):
        raise HTTPException(401, "Wrong or missing X-Cron-Secret header.")


@app.get("/")
def health():
    """Quick check that the server is running and what is configured."""
    return {
        "status": "ok",
        "supabase_configured": db.is_configured(),
        "push_configured": push.is_ready(),
        "sms_provider": config.SMS_PROVIDER,
        "face_model": faces.MODEL_NAME,
        "face_detector": config.FACE_DETECTOR,
        "alert_loop_seconds": config.ALERT_LOOP_SECONDS,
        "expand_to_5km_after_min": config.EXPAND_TO_5KM_AFTER_MIN,
        "expand_to_10km_after_min": config.EXPAND_TO_10KM_AFTER_MIN,
    }


@app.post("/worker/run")
async def worker_run(background: BackgroundTasks, x_cron_secret: str = Header(default=""), wait: bool = False):
    """
    Run one round of face matching + alerts.
    Supabase's timer calls this every 2 minutes and doesn't wait for the answer,
    so by default the work runs in the background. Add ?wait=true to see the result.
    """
    _check_cron_secret(x_cron_secret)
    if wait:
        return await run_worker_once()
    background.add_task(run_worker_once)
    return {"started": True}


@app.post("/alerts/run")
async def alerts_run(x_cron_secret: str = Header(default="")):
    """Run one round of alerts only, and show the result."""
    _check_cron_secret(x_cron_secret)
    return await alerts.run_alerts_once()


# ---- "Who is this?" photo search ----

MAX_UPLOAD_BYTES = 3 * 1024 * 1024  # 3 MB (the app shrinks photos to ~100 KB anyway)
_recent_searches: dict[str, list[float]] = defaultdict(list)


def _rate_limit(user_id: str, max_per_minute: int = 10) -> None:
    """Stop one person from running hundreds of searches (the AI is slow and costly)."""
    now = time.time()
    recent = [t for t in _recent_searches[user_id] if now - t < 60]
    if len(recent) >= max_per_minute:
        raise HTTPException(429, "Too many searches. Please wait a minute.")
    recent.append(now)
    _recent_searches[user_id] = recent


@app.post("/faces/search")
async def faces_search(photo: UploadFile = File(...), authorization: str = Header(default="")):
    """
    Upload a photo of someone; get back the active missing-person cases
    whose face looks most similar. Only for logged-in users.
    """
    user = await db.get_user_from_token(authorization.removeprefix("Bearer ").strip())
    if not user:
        raise HTTPException(401, "Please log in to use photo search.")
    _rate_limit(user["id"])

    data = await photo.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Photo is too large (max 3 MB).")

    try:
        found = await asyncio.to_thread(faces.get_embeddings, data)
    except ValueError:
        raise HTTPException(400, "This file is not a readable photo.")
    if not found:
        return {"face_found": False, "matches": []}

    rows = await db.rpc("match_case_faces", {"p_embedding": faces.to_pgvector(found[0]), "p_limit": 5}) or []
    matches = [
        {
            **r,
            "similarity": round(r["similarity"], 3),
            "likely_match": r["similarity"] >= faces.LIKELY_MATCH,
        }
        for r in rows
        if r["similarity"] >= 0.5  # don't show clearly different people
    ]
    return {"face_found": True, "faces_in_photo": len(found), "matches": matches}
