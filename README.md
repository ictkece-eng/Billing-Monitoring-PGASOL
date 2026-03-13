<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JfmsB3ObC29m55gKJrFkFEkwtCPO4TRr

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## (Optional) Persist data to TiDB (TiDB Cloud / TiDB Server)

The frontend **must not** connect directly to TiDB (it would expose credentials).
This repo includes a small Express API server under `server/` that acts as a secure bridge.

### 1) Create table

Run the SQL in `server/schema.sql` on your TiDB database (once).

### 2) Configure environment

Fill TiDB credentials in `.env` (this file is gitignored). You can either:

- Use `TIDB_URL` (recommended for TiDB Cloud), e.g. `mysql://.../DB?ssl=true`, OR
- Use `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`.

For TiDB Cloud, set `TIDB_SSL=true` (or `?ssl=true` in `TIDB_URL`).
If your environment requires a custom CA, set `TIDB_SSL_CA_BASE64`.

### 3) Run API server + frontend

In two terminals:

- API server: `npm run server:dev`
- Frontend: `npm run dev`

The app will show a button **Upload TiDB** and will also try to load existing records from TiDB on startup.

## Deploy to Vercel (with TiDB)

This repo includes Vercel Serverless Functions under `api/`.
When deployed to Vercel:

- Frontend is served from `dist/`
- Backend endpoints are available at:
   - `GET /api/health`
   - `GET /api/budget-records`
   - `POST /api/budget-records/upload`

### Vercel Environment Variables

Set these in **Vercel → Project → Settings → Environment Variables** (do not commit secrets):

- `TIDB_URL` (recommended): `mysql://USER:PASSWORD@HOST:4000/DBNAME?ssl=true`
   - OR set `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`
- `TIDB_SSL` = `true` (if not using `?ssl=true`)
- `TIDB_SSL_CA_BASE64` (optional)

Also set (if you use AI insight):

- `GEMINI_API_KEY`

Optional (admin tools UI lock):

- `VITE_TOOLS_PIN` (contoh: `123456`) — dipakai untuk membuka menu tersembunyi (Impor Excel + Upload/History TiDB).
   - Penting: ini dibaca oleh frontend (Vite), jadi harus diset sebagai env var di Vercel dan **re-deploy**.
