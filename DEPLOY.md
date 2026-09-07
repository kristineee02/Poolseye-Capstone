# Deploy PoolsEye admin web online

Host the **frontend + backend** online first. CCTV (`live_server.py`) can stay on an on-site PC and be linked later via `VITE_STREAM_URL`.

## 1. Backend (Render)

1. Create a **Web Service** from this GitHub repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
3. Environment variables:

| Key | Value |
|-----|--------|
| `JWT_SECRET` | Long random string |
| `FRONTEND_ORIGIN` | Your Vercel URL, e.g. `https://poolseye.vercel.app` |
| `BREVO_API_KEY` | Optional |
| `BREVO_SENDER` | Optional |

4. Deploy and copy the service URL, e.g. `https://poolseye-api.onrender.com`.

Notes:
- Free tiers may sleep when idle (cold start).
- SQLite on free hosts may reset on redeploy unless you add a **persistent disk**. Fine for early hosting; plan Postgres later for production data.

## 2. Frontend (Vercel)

1. Import this repo into Vercel.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Environment variables (Production):

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `https://poolseye-api.onrender.com` |
| `VITE_STREAM_URL` | Leave empty / omit for now, or set later to your stream tunnel |

4. Deploy. Copy the frontend URL.
5. Go back to Render and set `FRONTEND_ORIGIN` to that Vercel URL, then redeploy the backend.

## 3. Verify online (without CCTV)

- Open the Vercel site → admin login works
- Lifeguards / geofence / history hit the Render API
- Live monitoring may show **CCTV offline** until the stream server is reachable

## 4. CCTV later (optional)

On a PC on the same LAN as the Tapo camera:

```bash
cd scripts
python live_server.py
```

Expose port `8000` with a tunnel (ngrok / Cloudflare Tunnel), then set on Vercel:

```text
VITE_STREAM_URL=https://your-tunnel-url
```

Redeploy the frontend (Vite bakes env vars at build time).

## Local development

No `.env` required:

```bash
cd backend && npm run dev    # :4000
cd frontend && npm run dev   # :5173
cd scripts && python live_server.py   # :8000
```

Defaults in `frontend/src/config.js` use localhost when `VITE_*` vars are unset.
