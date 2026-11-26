"""
faces.py: face recognition with DeepFace (Facenet512 model).

  embedding = a list of 512 numbers describing a face.
  similarity = how alike two embeddings are (cosine similarity):
      1.0  = the same photo
      0.7+ = probably the same person   (DeepFace's own cut-off for Facenet512)
      <0.5 = probably different people

The heavy AI model is loaded only the first time it's needed, so the server
starts quickly. Face work is slow (about 1 second per photo on a CPU), so it
always runs in a separate thread to keep the server responsive.
"""

import logging
import os

import numpy as np

from . import config

log = logging.getLogger("faces")

MODEL_NAME = "Facenet512"
LIKELY_MATCH = 0.70  # similarity at or above this = "likely the same person"

_deepface = None  # loaded on first use


def _load():
    global _deepface
    if _deepface is None:
        log.info("Loading DeepFace %s model (first time only)...", MODEL_NAME)
        from deepface import DeepFace  # imported here because it's slow to import

        DeepFace.build_model(MODEL_NAME)
        _deepface = DeepFace
    return _deepface


def _decode(image_bytes: bytes):
    """Turn the bytes of a JPG/PNG file into an image array for DeepFace."""
    import cv2

    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("not a readable image")
    return img


def get_embeddings(image_bytes: bytes) -> list[list[float]]:
    """
    Find ALL faces in a photo and return one embedding per face
    (biggest face first). Returns [] if no face is found.
    """
    deepface = _load()
    from deepface.modules.exceptions import FaceNotDetected

    img = _decode(image_bytes)
    try:
        faces = deepface.represent(
            img_path=img,
            model_name=MODEL_NAME,
            detector_backend=config.FACE_DETECTOR,
            enforce_detection=True,  # raise an error if there's no face
            align=True,
        )
    except FaceNotDetected:
        return []

    # Biggest face first (in a crowd photo, the main subject is usually biggest)
    faces.sort(key=lambda f: f["facial_area"]["w"] * f["facial_area"]["h"], reverse=True)
    return [f["embedding"] for f in faces]


def similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity of two embeddings, limited to 0..1."""
    va, vb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    cos = float(np.dot(va, vb) / (np.linalg.norm(va) * np.linalg.norm(vb)))
    return max(0.0, min(1.0, cos))


def to_pgvector(embedding: list[float]) -> str:
    """Format an embedding the way the database's vector column expects: '[0.1,0.2,...]'"""
    return "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"


def from_pgvector(text: str) -> list[float]:
    """The reverse of to_pgvector."""
    return [float(x) for x in text.strip("[]").split(",")]


def warm_up_in_background() -> None:
    """Optionally pre-load the model when the server starts (set FACE_PRELOAD=1)."""
    if os.getenv("FACE_PRELOAD") == "1":
        try:
            _load()
        except Exception:
            log.exception("Could not pre-load the face model")
