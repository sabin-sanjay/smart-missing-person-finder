# Smart Missing Person Finder

An AI-powered Progressive Web App (PWA) that helps find missing people using
geo-targeted alerts, crowd-sourced sightings, a live map and face recognition.
Final-year college project.

## Folders

| Folder      | What's inside                                                        |
|-------------|----------------------------------------------------------------------|
| `frontend/` | The website/app (React + Vite + Tailwind CSS, installable as a PWA)  |
| `backend/`  | Python FastAPI server for face matching and alerts (added later)     |
| `supabase/` | SQL scripts to paste into the Supabase SQL Editor, run in number order |

## Run the app on your computer

```powershell
cd "C:\Users\sabin sanjay\Documents\smart-missing-person-finder\frontend"
npm install      # only needed the first time, or after new packages are added
npm run dev      # starts the app; press Ctrl+C to stop it
```

Open the **Local** address it prints (usually http://localhost:5173).

**Testing on a phone:** use `npm run dev:phone` instead. It starts the app on
**https://**, which phones require for GPS. Connect the phone to the **same Wi-Fi**,
open the **Network** address (e.g. `https://172.20.10.2:5173`), and when Chrome
warns "Your connection is not private", tap **Advanced → Proceed**. That warning
is expected for a home-made test certificate.

## Run the backend on your computer

Open a **second** terminal (the app keeps running in the first one):

```powershell
cd "C:\Users\sabin sanjay\Documents\smart-missing-person-finder\backend"
.venv\Scripts\Activate.ps1          # switch on the backend's Python 3.12 environment
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000 for a health check, or http://localhost:8000/docs to try the endpoints.

First time only (if `.venv` doesn't exist yet):
```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
If PowerShell says "running scripts is disabled", run this once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Put the app online (Netlify)

1. In `frontend/.env`, set `VITE_BACKEND_URL` to your Hugging Face address.
2. Build the final version:
   ```powershell
   cd "C:\Users\sabin sanjay\Documents\smart-missing-person-finder\frontend"
   npm run build
   ```
   This creates a `dist` folder.
3. Go to https://app.netlify.com/drop, log in, and **drag the `dist` folder** onto the page.
4. Netlify gives the site an address like `https://random-name-123.netlify.app`.
   Rename it under **Site configuration → Change site name**.
5. To publish an update later: run `npm run build` again, then open **Deploys** on the site and drag the new `dist` folder in.

After the first upload, update these three places with the new address:
- Supabase → Authentication → URL Configuration: **Site URL** = your Netlify address,
  and add `https://YOUR-SITE.netlify.app/**` to **Redirect URLs**
- Hugging Face Space → Settings → Secrets: **APP_URL** = your Netlify address (then restart the Space)

## Secret keys

Copy `frontend/.env.example` to `frontend/.env` and fill in the values.
`.env` is listed in `.gitignore`, so it is never uploaded. Never put private keys
(Supabase service_role, Firebase service account, SMS keys) in the frontend.

## Progress

- [x] Step 1: Project setup (React, Vite, Tailwind, PWA, page navigation)
- [x] Step 2: Supabase database + security rules (`supabase/001_initial_schema.sql`)
- [x] Step 3: Login (email + Google) and user roles (`supabase/003_make_admin.sql` gives admin/police)
- [x] Step 4: Register a missing-person case (`/my-cases`, `/my-cases/new`)
- [x] Step 5: Police approve or reject cases (`/police`, `/police/case/:id`)
- [x] Step 6: Report a sighting (`/report`, public case page `/case/:id`, HTTPS phone testing)
- [x] Step 7: Live map (`/map`: case photo pins, alert circles, sightings for police)
- [x] Step 8: Push alerts (2 km, then 5 km, then 10 km) + SMS fallback (`supabase/004_push_alerts.sql`, `backend/`)
- [x] Step 9: Face-matching backend (DeepFace Facenet512, `/who-is-this`, Hugging Face deploy, `supabase/005` + `006`)
- [x] Step 10: Forgot password, spam limits, admin user management, case PDFs, Hindi, speed tuning, Netlify deploy (`supabase/007`)
