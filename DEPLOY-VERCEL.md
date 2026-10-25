# Deploy MATA Store with Vercel Services

## Architecture and routing

This repository has two Vercel services in the root `vercel.json`:

| Service | Root | Framework | Public routing |
|---|---|---|---|
| `backend` | `backend/` | Express | `/api` and `/api/*` |
| `frontend` | `frontend/` | Vite | All other paths |

Both services receive public traffic through the top-level rewrites. The frontend's browser-side API requests use relative `/api/...` URLs, so the browser reaches the backend through the public rewrite on the same domain. There are no internal service-to-service calls and therefore no service bindings. Firebase/Firestore and Cloudinary are external services, not services in this Vercel project.

Connect the repository root (the directory containing `vercel.json`) as one Vercel project. Do not set a separate Vercel Root Directory to `backend/` or `frontend/`; each service root is configured in `vercel.json`.

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
| `MAX_VIDEO_UPLOAD_MB` | Optional | Maximum video size in MB (default 50; hard cap 100). |

The frontend and backend share the public Vercel origin, so `FRONTEND_ORIGIN` is not required for same-origin requests. `GOOGLE_APPLICATION_CREDENTIALS` is for local development only and should not be used on Vercel.

### Frontend (public Firebase web-app configuration)

Add the Firebase web app values as Vercel environment variables for Production and Preview. These are public identifiers, not server secrets.

| Name | Required |
|---|---|
| `VITE_FIREBASE_API_KEY` | Yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes |
| `VITE_FIREBASE_PROJECT_ID` | Yes |
| `VITE_FIREBASE_APP_ID` | Yes |

Frontend API calls use relative `/api` paths; do not set `VITE_API_URL`. Vite reads `VITE_*` variables at build time, so changes require a new deployment.

## Firebase

In Firebase Authentication settings, add the deployed `*.vercel.app` domain and any custom domain to Authorized domains. If the Web API key has referrer restrictions, allow those domains there too.

## Local development and verification

Use `vercel dev` to exercise the Vercel Services routing locally. To run the apps separately instead, install both packages from the repository root with `npm run install:all`, copy `backend/.env.example` to `backend/.env`, then run `npm run dev:backend` and `npm run dev:frontend` in separate terminals. The Vite dev server proxies `/api` requests to the local backend.

After deployment, verify:

1. `/` loads the storefront.
2. `/api/health` returns JSON with `"status":"ok"` and the Firebase status.
3. `/api/products` returns JSON with a `products` array.
4. `/admin` loads the admin login after a refresh.
5. Checkout, admin login, and an image upload work using the deployment domain.

If Firebase reports `misconfigured` or an API route returns a Vercel error, check the backend service's environment variables and runtime logs.
