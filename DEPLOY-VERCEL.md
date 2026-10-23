# MATA Store on Vercel — audit, changes, settings, deploy, rollback

Base project: `mata-store-new-fixed_5.zip`. Nothing here has been deployed; see "What was and wasn't verified".

## 1. Audit

| Area | Finding |
|---|---|
| Frontend | React 19 + Vite 8 in `frontend/`. No router: `/admin` is detected in `main.jsx`, checkout uses `#checkout`. |
| Backend | Express 5 in `backend/` (CommonJS). Routes: products, orders, settings, reviews, admin products/orders/settings/reviews, admin upload. |
| Firebase (browser) | Only **Firebase Auth** (`firebase.js`, used by the admin login). The browser never touches Firestore. |
| Firebase (server) | Admin SDK: Firestore for all data, `verifyIdToken` for admin routes. Admin = UID in `ADMIN_UIDS`. |
| Cloudinary | Server-side multer upload (5 MB images, 50 MB videos) with magic-byte checks. |
| Orders | Already correct: prices and shipping computed from Firestore, one transaction for stock + order + idempotency record, COD only, zod validation. Left unchanged. |
| Tests | `logic.test.js` (stubbed, 145 passing before my changes), `api.test.js` (needs real npm deps). |

### Cause of `auth/invalid-api-key`
`frontend/src/firebase.js` reads `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Vite substitutes these **at build time**. If they are not set in the Vercel project before the build, they compile to `undefined`, and `getAuth()` throws. The project had no frontend `.env.example`, and because the error was thrown while the entry bundle loaded, it could blank the storefront too.

### Problems that would have broken a plain Vercel deploy
1. **Hard-coded `http://localhost:3000`** as the API default in `admin.js` and `App.jsx`; `orders.js` refused to place orders when `VITE_API_URL` was empty.
2. **`server.js` calls `app.listen`**, which does not work on Vercel Functions.
3. **Firebase Admin used Application Default Credentials only** (a key file on disk). Vercel has no key file; it needs env-var credentials.
4. **Vercel request bodies are limited to about 4.5 MB.** The 5 MB image and 50 MB video uploads could not work through the API.
5. **`trust proxy` was not set**, so the rate limiters would see the proxy's IP and treat all visitors as one client.

## 2. Plan (what I changed)

| File | Change |
|---|---|
| `api/index.js` (new) | Vercel Function entry; exports the Express app. |
| `vercel.json` (new) | Build settings, `/api/*` → function, `/admin` → SPA, basic security headers. |
| `package.json` (new, root) | Scripts only; Node 22. |
| `backend/app.js` (new) | The Express app from `server.js`, plus `trust proxy`, exported. |
| `backend/server.js` | Now only `listen` (local use). |
| `backend/src/database/credentials.js` (new) + `firestore.js` | Credentials from env vars, ADC fallback for local use. |
| `backend/src/middleware/adminAuth.js` | Ensures the Admin app is initialised before token verification. Logic unchanged. |
| `backend/src/routes/adminUpload.js` | New admin-only `POST /api/admin/upload/sign`. Old multipart routes kept. |
| `frontend/src/api/base.js` (new), `admin.js`, `orders.js`, `site.js`, `App.jsx` | Same-origin `/api/...` by default. Uploads go browser → Cloudinary using the signature. |
| `frontend/src/firebase.js`, `AdminApp.jsx` | Missing config no longer crashes the site; the admin page names the missing variables. |
| `frontend/vite.config.js` | Dev proxy `/api` → `localhost:3000`. |
| `.env.example` ×2, `.gitignore`, `firestore.rules` | Placeholders only; the rules file is optional. |
| Tests | `credentials.test.js` added; 11 sign-endpoint checks added; the static security check now reads `app.js` instead of `server.js` (same assertions). |

Preserved: UI, admin panel, API paths and formats, Firestore schema, COD checkout, server-side pricing, admin authorization.

## 3. Vercel settings

- **Root Directory:** the folder that contains `vercel.json`, `api/`, `backend/`, `frontend/`.
- **Framework Preset:** Other. Install / Build / Output are taken from `vercel.json`:
  - Install: `npm ci --prefix backend && npm ci --prefix frontend`
  - Build: `npm run build --prefix frontend`
  - Output: `frontend/dist`
- **Node.js version:** 22.x.
- **Function region:** Project Settings → Functions → pick the region closest to your Firestore database location.

## 4. Environment variables

Set for **Production and Preview**. Mark secrets as Sensitive.

| Name | Where | Secret? | Notes |
|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | build | no (public) | Firebase Console → Project settings → Your apps → Web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | build | no | |
| `VITE_FIREBASE_PROJECT_ID` | build | no | `mata-store-eg` |
| `VITE_FIREBASE_APP_ID` | build | no | |
| `VITE_API_URL` | build | no | Leave **empty/unset** |
| `ADMIN_UIDS` | server | treat as private | Comma-separated UIDs (Authentication → Users) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | server | **yes** | Whole service-account JSON (raw or base64). Or use `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (+ `FIREBASE_PROJECT_ID`) |
| `CLOUDINARY_CLOUD_NAME` | server | no | |
| `CLOUDINARY_API_KEY` | server | yes | |
| `CLOUDINARY_API_SECRET` | server | **yes** | |
| `MAX_VIDEO_UPLOAD_MB` | server | no | Optional, default 50 |
| `FRONTEND_ORIGIN` | server | no | Not needed when same-origin |

Never put the service account or Cloudinary secret in a `VITE_` variable: those are published in the browser bundle. Paste them into Vercel directly, never into chat.

## 5. Firebase configuration

1. Authentication → Sign-in method: Email/Password enabled (already, since your admin login works locally).
2. Authentication → Settings → Authorized domains: add your `*.vercel.app` domain and any custom domain.
3. If the Web API key has HTTP-referrer restrictions (Google Cloud Console → Credentials), add your Vercel domain(s), or login fails.
4. Project settings → Service accounts → Generate new private key; put the JSON in `FIREBASE_SERVICE_ACCOUNT_JSON`. Do not commit it.
5. Firestore rules: the browser never uses Firestore, so deny-all is safe. `firestore.rules` is provided. **Compare with your current rules first** and publish only if nothing else relies on them. No rule changes are required for this deployment.
6. `storage.rules.txt` and the `Install-ImageUpload*.ps1` scripts are from an older Firebase Storage approach; the app now uses Cloudinary. Not needed.

## 6. What was and wasn't verified

| Check | Result |
|---|---|
| `node --check` on all backend and `api/` files | Pass |
| `logic.test.js` (stubbed) | **156 passed, 0 failed** (145 before + 11 new). Run with zod 3.25 because the project's zod 4 could not be installed |
| `credentials.test.js` | 7 passed |
| Firebase Admin wiring (stubbed) | Env credentials use `cert()`, none falls back to ADC |
| `firebase.js` guard (stubbed) | Missing vars → `auth = null`, no throw; present → normal |
| Frontend bundle parse (esbuild, deps external) | No errors |
| `npm ci`, `vite build`, `api.test.js` | **Not run.** The sandbox cannot reach the npm registry |
| Vercel routing, Firestore, Firebase Auth, Cloudinary, deployed site | **Not verified** |

One bug was caught by the new tests and fixed: `{"type":["image"]}` was accepted by the sign endpoint.

Your zips included an incomplete `node_modules` folder (e.g. zod missing). Leave it out when zipping; Vercel installs its own.

## 7. Known limitations

- **Rate limits are per function instance** (in-memory), so they are weaker on Vercel than on one server. Add a Vercel Firewall rate-limit rule for `/api/orders` and `/api/reviews`.
- The old multipart upload routes still exist but inherit Vercel's ~4.5 MB limit; the UI no longer uses them.
- Direct uploads rely on Cloudinary enforcing `allowed_formats` (signed) and your account size limits; the 5 MB / video cap is enforced in the admin browser only. Only signed-in admins can obtain a signature.
- `idempotencyKeys` documents accumulate; consider a Firestore TTL policy on `createdAt` later.

## 8. Apply and deploy

1. Back up your current project folder (copy it; don't overwrite it).
2. Copy the files from this package over your local project **or** use the package as the project. Do not copy `node_modules`.
3. Local check (optional): `cd backend && npm ci && npm test`, then `cd ../frontend && npm ci && npm run build`. Report any failure before deploying.
4. Local run: put values in `backend/.env` and `frontend/.env.local` (from the `.env.example` files), run `npm run dev` in `backend/` and `frontend/`.
5. Commit to a **new branch** (`vercel-migration`), push.
6. Vercel → Add New Project → import the repo, set Root Directory, add the environment variables from section 4, deploy. This creates a **preview** and leaves any existing site untouched.
7. Check on the preview URL:
   - `/api/health` → `{"status":"ok"}`
   - `/api/products` → your products
   - `/admin` → log in with your admin account
   - Upload one small image and one small video
   - Place a Cash on Delivery test order, then cancel it in admin (cancelling restores the stock)
   - If login shows the missing-variables message, add the variables and **redeploy**
8. Promote to Production / attach your domain only after all checks pass.

## 9. Rollback

Nothing is deleted or migrated: Firestore data and schema, Cloudinary assets and your old project are untouched.
- Instant rollback: Vercel → Deployments → previous deployment → Promote to Production.
- Full rollback: keep serving the old project; remove the new Vercel project or domain.
- The only data the new code adds is `idempotencyKeys` and normal orders, which are harmless.
- Rotating the service account key: create a new key, update the variable, redeploy, then disable the old key.
