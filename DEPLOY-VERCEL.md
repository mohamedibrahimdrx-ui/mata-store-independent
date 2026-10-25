# MATA Store on Vercel: ONE project, ONE domain

Architecture: `frontend/` (Vite) builds to static files. `api/index.js` runs the existing Express app (`backend/app.js`)
as a single Vercel Function. `vercel.json` sends `/api/*` to that function and everything else to the React site.
Data stays in Firestore, images/videos in Cloudinary, admin login in Firebase Auth. Nothing was migrated.

## Vercel project settings
| Setting | Value |
|---|---|
| Root Directory | repo root (leave EMPTY, the folder containing `vercel.json`, `api/`, `frontend/`, `backend/`) |
| Framework Preset | **Other** (NOT "Services" or "Vite") |
| Install / Build / Output | leave defaults: all three come from `vercel.json` (`npm ci` in backend + frontend, `npm run build --prefix frontend`, `frontend/dist`) |
| Node.js Version | 22.x |
| Function Region | closest to your Firestore location (Settings > Functions) |

## Environment variables (Production AND Preview; redeploy after any change)
Frontend (public, read at build time):
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Do NOT set `VITE_API_URL`.

Backend (server only, mark secrets Sensitive):
`ADMIN_UIDS`, `FIREBASE_SERVICE_ACCOUNT_JSON` (whole JSON, raw or base64), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`. Optional: `MAX_VIDEO_UPLOAD_MB`. `FRONTEND_ORIGIN` is not needed (same origin).

## Firebase
Authentication > Settings > Authorized domains: add your `*.vercel.app` domain and custom domain.
If the Web API key has referrer restrictions, add them there too.

## Verify (on the deployment URL)
1. `/api/health` returns `{"status":"ok"}`
2. `/api/products` returns your products as JSON
3. `/` shows the storefront; refresh on `/admin` loads the admin login (not a 404)
4. Log in as admin; edit a product; upload one image (goes browser to Cloudinary)
5. Place a COD test order, see it in Admin > Orders, cancel it (stock is restored)

## Troubleshooting
- Build log shows "services"/wrong preset: set Framework Preset to Other and redeploy.
- `/api/*` returns 500: Functions logs; usually a missing `FIREBASE_SERVICE_ACCOUNT_JSON` or malformed JSON.
- Admin says missing Firebase variables: add the `VITE_FIREBASE_*` values and redeploy (build-time).
- `vercel.services.json.old` is the previous (beta Services) config, kept only for reference.
