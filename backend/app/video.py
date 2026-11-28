"""
video.py: search a CCTV / phone video for a missing person's face.

The video is NOT stored anywhere: it's read from memory, checked, and thrown
away. We look at up to MAX_FRAMES evenly spaced moments (at most one per
second), find every face in each, and compare them with ALL the photos of
the case. The result is the best moments, with a small picture of each.
"""

import base64
import os
import tempfile

import cv2

from . import faces

MAX_FRAMES = 40          # keeps one search under about a minute on a laptop
THUMB_WIDTH = 360


def _thumb(frame) -> str:
    h, w = frame.shape[:2]
    small = cv2.resize(frame, (THUMB_WIDTH, int(h * THUMB_WIDTH / w)))
    ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode() if ok else ""


def search_video(video_bytes: bytes, case_embeddings: list[list[float]]) -> dict:
    """Returns {frames_checked, faces_seen, duration_s, moments: [{time_s, similarity, thumbnail}]}."""
    # OpenCV reads videos from a file, so write it to a temporary file first
    fd, path = tempfile.mkstemp(suffix=".mp4")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(video_bytes)
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise ValueError("not a readable video")
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = total / fps if total else 0
        if total <= 0:
            raise ValueError("not a readable video")

        # evenly spaced moments, never closer than 1 second apart
        step = max(int(fps), total // MAX_FRAMES or 1)
        moments, faces_seen, checked = [], 0, 0
        for index in range(0, total, step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = cap.read()
            if not ok:
                continue
            checked += 1
            ok, jpg = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            found = faces.get_embeddings(jpg.tobytes())
            if not found:
                continue
            faces_seen += len(found)
            best = max(faces.similarity(c, e) for c in case_embeddings for e in found)
            moments.append({"time_s": round(index / fps, 1), "similarity": round(best, 3), "frame": frame})
            if checked >= MAX_FRAMES:
                break
        cap.release()

        moments.sort(key=lambda m: m["similarity"], reverse=True)
        top = [
            {"time_s": m["time_s"], "similarity": m["similarity"],
             "likely_match": m["similarity"] >= faces.LIKELY_MATCH, "thumbnail": _thumb(m["frame"])}
            for m in moments[:5]
        ]
        return {"frames_checked": checked, "faces_seen": faces_seen, "duration_s": round(duration, 1), "moments": top}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
