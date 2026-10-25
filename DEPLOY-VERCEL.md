<<<<<<< HEAD
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
=======
# Deploy MATA Store as one Vercel project

## Architecture

- Connect the repository root as **one** Vercel project.
- Vercel builds the React/Vite app from `frontend/` into `frontend/dist`.
- `api/index.js` exports the existing Express app in `backend/app.js` as one Vercel Function. The `/api/*` rewrite sends API requests to it; other paths fall back to the Vite app for routes such as `/admin`.
- Frontend API calls use relative `/api/...` URLs, so the browser talks to the frontend and API on the same domain. No separate backend host or frontend API URL is needed.
- Firestore is the existing persistent external database; no database migration is needed. Product and site data continue to use Firebase Admin/Firestore.
- Image/video uploads use Cloudinary. The admin API signs uploads and the browser sends files directly to Cloudinary, not to Vercel's temporary filesystem or function request body.

## Vercel project settings

Create or connect **one** Vercel project for this repository:

| Setting | Value |
|---|---|
| Root Directory | Repository root (`.`); do not select `frontend/` or `backend/` |
| Framework Preset | Other |
| Install Command | `npm run install:all` |
| Build Command | `npm run build` |
| Output Directory | `frontend/dist` |
| Node.js Version | 22.x |

These commands and the output directory are also configured in `vercel.json`. Keep the project root at the repository root so Vercel can see `api/index.js`, both package manifests, and the frontend build output.

## Environment variables

Add variables in **Project Settings → Environment Variables** for Production and Preview, then redeploy. Do not commit `.env` files or service-account credentials.

### Backend (server-only)

Configure one Firebase Admin credential option:

| Name | Required | Value |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes, recommended | Complete Firebase service-account JSON as one line. |
| `FIREBASE_CLIENT_EMAIL` | Alternative | Service-account client email; use with `FIREBASE_PRIVATE_KEY`. |
| `FIREBASE_PRIVATE_KEY` | Alternative | Service-account private key; keep escaped `\n` line breaks intact. |
| `FIREBASE_PROJECT_ID` | Optional | Firebase project ID when using the separate credential fields. |
| `ADMIN_UIDS` | Yes | Comma-separated Firebase Auth UIDs permitted to access the admin API. |
| `CLOUDINARY_CLOUD_NAME` | Yes for uploads | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Yes for uploads | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Yes for uploads | Cloudinary API secret; keep server-side only. |
| `FRONTEND_ORIGIN` | Optional | Exact frontend origin, e.g. `https://mata-store-new-4wse.vercel.app`. Separate additional origins with commas. Same-origin frontend requests do not require CORS. |
| `MAX_VIDEO_UPLOAD_MB` | Optional | Maximum video size in MB (default 50; hard cap 100). |

`GOOGLE_APPLICATION_CREDENTIALS` is for local development only and should not be used on Vercel.

### Frontend (public Firebase web-app configuration)

Add the Firebase web app values as Vercel environment variables for Production and Preview. They are embedded into the frontend build and are public identifiers, not server secrets.

| Name | Required |
|---|---|
| `VITE_FIREBASE_API_KEY` | Yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes |
| `VITE_FIREBASE_PROJECT_ID` | Yes |
| `VITE_FIREBASE_APP_ID` | Yes |

Do not set `VITE_API_URL`: all API requests use relative `/api` paths. Changes to `VITE_*` variables require a new deployment because Vite reads them at build time.

## Deploy

1. Push the repository to GitHub.
2. In Vercel, import that repository and create a single project with the settings above.
3. Add the environment variables for both Production and Preview.
4. Deploy. If the repository is already connected, push the changes and wait for the new deployment to become **Ready**.

## Verify

Use the same deployment domain for each check:

1. `https://<your-domain>/` loads the storefront.
2. `https://<your-domain>/api/health` returns JSON with `"status":"ok"` and `"firebase":"ready"`.
3. `https://<your-domain>/api/products` returns JSON with a `products` array (an empty array is valid if no active products exist).
4. Add a product to the cart and place a test order to exercise checkout and the orders API.
5. Open `https://<your-domain>/admin`, sign in with an allowed Firebase account, and verify products and orders load.
6. In the Admin Dashboard, upload a test image and confirm it is stored at a Cloudinary URL.

If `/api/health` reports `"firebase":"misconfigured"`, review the Firebase Admin credentials and redeploy. If the API returns a Vercel error page, check that the project Root Directory is the repository root and inspect the deployment's Function runtime logs.

## Local development

From the repository root:

```sh
npm run install:all
```

Copy `backend/.env.example` to `backend/.env` and fill in local credentials. Then run the backend and frontend in separate terminals:

```sh
npm run dev:backend
npm run dev:frontend
```

Vite proxies local `/api` requests to the backend on port 3000. To run the backend checks:

```sh
npm test
```
>>>>>>> cd9eccd63c9330d33b8807fdf5dc11a6578c0b8f
