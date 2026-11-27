"""
face_jobs.py: the background face-matching work, done a few photos at a time.

  1. New case photos  -> compute the face embedding, store it in case_faces
  2. New sighting photos -> compute embeddings of every face in the photo,
     compare each with the case's face, save the best score on the sighting
     (police see it as "🤖 Face match: 83%")
  3. "Found someone" photos -> compute the face, compare with every active
     missing case, save the best match (and re-check open reports when a
     new missing case appears)
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
                    # Compare with EVERY photo of the case (main + extra photos)
                    case_embeddings = [faces.from_pgvector(r["case_embedding"])]
                    try:
                        extra = await db.rpc("case_embeddings", {"p_case": r["case_id"]}) or []
                        case_embeddings = [faces.from_pgvector(x["embedding"]) for x in extra] or case_embeddings
                    except Exception:
                        pass  # before supabase/014: main photo only
                    # Several people in the photo? Keep the best match.
                    best = max(faces.similarity(c, e) for c in case_embeddings for e in found)
                    values["face_match_score"] = round(best, 3)
            except Exception as e:
                log.exception("Sighting photo %s failed", r["sighting_id"])
                values["face_error"] = f"could not process photo: {e}"[:300]

        await db.update_by_id("sightings", r["sighting_id"], values)
    return len(rows)


async def process_extra_case_photos(limit: int = 10) -> int:
    """Extra photos added to a case: make their face fingerprints too."""
    try:
        rows = await db.rpc("case_photos_needing_faces", {"p_limit": limit}) or []
    except Exception:
        return 0  # before supabase/014
    for r in rows:
        embedding, error = None, None
        try:
            photo = await db.download_photo("case-photos", r["photo_path"])
            found = await asyncio.to_thread(faces.get_embeddings, photo)
            if found:
                embedding = faces.to_pgvector(found[0])
            else:
                error = "no face found in this photo"
        except Exception as e:
            log.exception("Extra case photo %s failed", r["photo_id"])
            error = f"could not process photo: {e}"[:300]
        await db.upsert("case_photo_faces",
                        {"photo_id": r["photo_id"], "case_id": r["case_id"], "embedding": embedding,
                         "error": error, "computed_at": _now()},
                        on_conflict="photo_id")
    return len(rows)


LIKELY_MATCH = 0.70


async def _best_case_match(embedding_text: str):
    """The active missing case whose face is closest, and how close (0..1)."""
    rows = await db.rpc("match_case_faces", {"p_embedding": embedding_text, "p_limit": 1}) or []
    if not rows:
        return None, None
    return rows[0]["case_id"], round(float(rows[0]["similarity"]), 3)


async def process_found_photos(limit: int = 10) -> int:
    rows = await db.rpc("found_needing_faces", {"p_limit": limit}) or []
    for r in rows:
        values = {"face_checked_at": _now(), "face_error": None}
        try:
            photo = await db.download_photo("found-photos", r["photo_path"])
            found = await asyncio.to_thread(faces.get_embeddings, photo)
            if not found:
                values["face_error"] = "no face found in the photo"
            else:
                emb = faces.to_pgvector(found[0])
                await db.upsert("found_faces", {"found_id": r["found_id"], "embedding": emb, "computed_at": _now()},
                                on_conflict="found_id")
                case_id, score = await _best_case_match(emb)
                values["match_case_id"] = case_id
                values["match_score"] = score
                if score is not None and score >= LIKELY_MATCH:
                    values["status"] = "matched"
        except Exception as e:
            log.exception("Found photo %s failed", r["found_id"])
            values["face_error"] = f"could not process photo: {e}"[:300]
        await db.update_by_id("found_persons", r["found_id"], values)
    return len(rows)


async def recheck_found(limit: int = 20) -> int:
    """A new missing case appeared: compare open found reports again."""
    rows = await db.rpc("found_needing_recheck", {"p_limit": limit}) or []
    for r in rows:
        values = {"face_checked_at": _now()}
        case_id, score = await _best_case_match(r["embedding"])
        if case_id:
            values["match_case_id"] = case_id
            values["match_score"] = score
            if score is not None and score >= LIKELY_MATCH:
                values["status"] = "matched"
        await db.update_by_id("found_persons", r["found_id"], values)
    return len(rows)


async def run_face_jobs_once() -> dict:
    if not db.is_configured():
        return {"error": "Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)."}
    cases_done = await process_case_photos()
    cases_done += await process_extra_case_photos()
    sightings_done = await process_sighting_photos()
    found_done = await process_found_photos()
    rechecked = await recheck_found()
    if cases_done or sightings_done or found_done or rechecked:
        log.info("Face jobs: %d case, %d sighting, %d found photos, %d rechecked",
                 cases_done, sightings_done, found_done, rechecked)
    return {"case_photos_processed": cases_done, "sighting_photos_processed": sightings_done,
            "found_photos_processed": found_done, "found_rechecked": rechecked}
