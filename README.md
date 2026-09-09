# PoolsEye

Admin web dashboard + lifeguard mobile app.

## Structure

```
Poolseye-Capstone/
  backend/      Express + SQLite API (auth, lifeguards, geofence)
  frontend/     React + Vite admin console (browser)
  mobile/       Expo lifeguard app (Android / iOS)
```

## Backend

```bash
cd backend
npm install
cp .env.example .env    # set JWT_SECRET and optional SMTP
npm run dev             # http://localhost:4000
```

Default admin (seeded on first run): see `backend/db.js`.

Demo lifeguard for mobile testing: `jonas@poolseye.com` / `lifeguard123` (must change password on first login).

## Web (frontend)

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Sign in as admin, then use **Lifeguard accounts** to create mobile login credentials.

## Mobile (Expo SDK 57)

```bash
cd mobile
npm install
npx expo install --fix
```

Set your PC's LAN IP so the phone can reach the backend (optional — Expo Go usually auto-detects):

```bash
# PowerShell — replace with your IP from ipconfig (only if auto-detect fails)
$env:EXPO_PUBLIC_API_URL="http://192.168.1.3:4000"
npm start
```

By default the app derives `http://<your-pc-lan-ip>:4000` from the Expo/Metro host, so a physical phone on the same Wi‑Fi works without setting the env var. Keep `backend` running (`npm run dev` on port 4000).

Scan the QR code in **Expo Go (SDK 57)** on your phone (same Wi‑Fi as your PC).

## Email API setup (Brevo)

By default, emails are **demo mode** (logged to the backend console). To send real verification and welcome emails via **Brevo REST API**:

1. Sign up at [brevo.com](https://www.brevo.com)
2. **Settings → SMTP & API → API Keys** — create an API key (starts with `xkeysib-`)
3. **Settings → Senders & IPs → Senders** — add and verify your sender email
4. In `backend/.env`:

```
BREVO_API_KEY=xkeysib-your-api-key-here
BREVO_SENDER=PoolsEye <noreply@yourdomain.com>
```

5. Restart the backend: `cd backend && npm run dev`

Leave `BREVO_API_KEY` empty for demo mode — codes appear in the backend terminal and in a dashboard toast.

## From project root

```bash
npm run dev       # starts frontend
npm run mobile    # starts Expo
npm run install:all
```

## Host online

See **[DEPLOY.md](./DEPLOY.md)** for Render (API) + Vercel (web) setup.

Runtime URLs are configured with:

- `VITE_API_URL` — Express backend
- `VITE_STREAM_URL` — CCTV stream server (`live_server.py`)
- `FRONTEND_ORIGIN` — allowed browser origin(s) for CORS

Local defaults remain `http://localhost:4000` and `http://localhost:8000` when those vars are unset.
