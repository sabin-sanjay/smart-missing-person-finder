"""
face_jobs.py: the background face-matching work, done a few photos at a time.

  1. New case photos  -> compute the face embedding, store it in case_faces
  2. New sighting photos -> compute embeddings of every face in the photo,
     compare each with the case's face, save the best score on the sighting
     (police see it as "🤖 Face match: 83%")
"""

import asyncio
import logging
from datetime import datetime, timezone

from . import faces
from . import supabase_client as db

log = logging.getLogger("face_jobs")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def process_case_photos(limit: int = 10) -> int:
    rows = await db.rpc("cases_needing_faces", {"p_limit": limit}) or []
    for r in rows:
        embedding, error = None, None
        try:
            photo = await db.download_photo("case-photos", r["photo_path"])
            found = await asyncio.to_thread(faces.get_embeddings, photo)
            if found:
                embedding = faces.to_pgvector(found[0])  # biggest face = the missing person
            else:
                error = "no face found in the case photo"
        except Exception as e:
            log.exception("Case photo %s failed", r["case_id"])
            error = f"could not process photo: {e}"[:300]

        await db.upsert(
            "case_faces",
            {"case_id": r["case_id"], "photo_path": r["photo_path"], "embedding": embedding,
             "error": error, "computed_at": _now()},
            on_conflict="case_id",
        )
    return len(rows)


async def process_sighting_photos(limit: int = 20) -> int:
    rows = await db.rpc("sightings_needing_faces", {"p_limit": limit}) or []
    for r in rows:
        values = {"face_checked_at": _now(), "face_error": None, "face_match_score": None}
        if not r.get("case_embedding"):
            values["face_error"] = "the case photo has no clear face to compare with"
        else:
            try:
                photo = await db.download_photo("sighting-photos", r["photo_path"])
                found = await asyncio.to_thread(faces.get_embeddings, photo)
                if not found:
                    values["face_error"] = "no face found in the sighting photo"
                else:
                    case_embedding = faces.from_pgvector(r["case_embedding"])
                    # Several people in the photo? Keep the best match.
                    best = max(faces.similarity(case_embedding, e) for e in found)
                    values["face_match_score"] = round(best, 3)
            except Exception as e:
                log.exception("Sighting photo %s failed", r["sighting_id"])
                values["face_error"] = f"could not process photo: {e}"[:300]

        await db.update_by_id("sightings", r["sighting_id"], values)
    return len(rows)


async def run_face_jobs_once() -> dict:
    if not db.is_configured():
        return {"error": "Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)."}
    cases_done = await process_case_photos()
    sightings_done = await process_sighting_photos()
    if cases_done or sightings_done:
        log.info("Face jobs: %d case photos, %d sighting photos", cases_done, sightings_done)
    return {"case_photos_processed": cases_done, "sighting_photos_processed": sightings_done}
