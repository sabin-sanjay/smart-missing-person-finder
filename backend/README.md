---
title: Missing Person Finder API
emoji: 🔎
colorFrom: blue
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# Smart Missing Person Finder: backend

FastAPI server for the Smart Missing Person Finder app:

- **Face matching** (DeepFace, Facenet512): compares sighting photos with case photos,
  and searches active cases by photo (`POST /faces/search`).
- **Geo-targeted alerts:** Firebase push notifications to phones within 2 km, growing
  to 5 km and then 10 km, with an SMS fallback.

Open `/docs` to try the endpoints. All secrets are set as Space **Secrets**, never in the code.

(The settings block at the top of this file is for Hugging Face Spaces.)
