/**
 * Runtime endpoints for the admin web app.
 * Local defaults keep `npm run dev` working without a .env file.
 * Set VITE_API_URL / VITE_STREAM_URL when deploying (Vercel, etc.).
 */
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')
export const STREAM_BASE = (import.meta.env.VITE_STREAM_URL || 'http://localhost:8000').replace(/\/$/, '')
