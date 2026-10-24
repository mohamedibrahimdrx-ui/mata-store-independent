# MATA Store on Vercel

## Architecture (one Vercel project)

- `frontend/` (Vite) is built to static files: `frontend/dist`.
- `api/index.js` is the only Vercel Function. It exports the Express app from `backend/app.js`.
- `vercel.json` sends every `/api/*` request to that function and serves the storefront and `/admin` from the static build.
- Plain CommonJS, no `services` block, no framework auto-detection for the backend. Vercel traces the files the function requires and runs them as written.
- Uploads go from the browser straight to Cloudinary (signed by `/api/admin/upload/sign`), so Vercel's ~4.5 MB request-body limit does not apply.

## Vercel project settings (Settings -> General / Build & Development)

| Setting | Value |
|---|---|
| Framework Preset | **Other** |
| Root Directory | *(empty - repository root)* |
| Install Command | leave default (taken from `vercel.json`: `cd backend && npm ci && cd ../frontend && npm ci`) |
| Build Command | leave default (`cd frontend && npm run build`) |
| Output Directory | leave default (`frontend/dist`) |
| Node.js Version | 22.x |

If any of these were overridden in the dashboard earlier (especially Root Directory = `backend` or `frontend`, or a Framework Preset of Express/Vite), clear or fix them. Dashboard overrides win over `vercel.json`.

## Environment variables (Settings -> Environment Variables)

Set for **Production** and **Preview**, then **redeploy** (a change only applies to new deployments).

Backend (server-only, never prefix with `VITE_`):

| Name | Required | Notes |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | yes (Option A) | The whole service-account JSON, raw or base64-encoded. |
| `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | alternative (Option B) | Use instead of Option A. Keep `\n` line breaks in the key. Optional `FIREBASE_PROJECT_ID`. |
| `ADMIN_UIDS` | yes | Comma-separated Firebase Auth UIDs allowed into `/admin`. |
| `FRONTEND_ORIGIN` | yes | `https://mata-store-new.vercel.app` (comma-separate extra origins, e.g. a custom domain). |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | yes | Image/video uploads. |
| `MAX_VIDEO_UPLOAD_MB` | no | Default 50, hard cap 100. |

Frontend (public identifiers, baked in at build time):

| Name | Required |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | yes |
| `VITE_API_URL` | leave **unset/empty** (frontend and API share one domain) |

`GOOGLE_APPLICATION_CREDENTIALS` is for local development only. It does not work on Vercel.

## Deploying without the `git` command in PowerShell

Option 1 - VS Code Source Control:
1. Copy the files from the repaired ZIP over your project folder (keep your existing `.git` folder; the ZIP has none). Do not copy any `.env` file anywhere.
2. VS Code -> Source Control. Review the changes, type a message such as `Fix Vercel deployment`, click **Commit**, then **Sync Changes** / **Push**.

Option 2 - GitHub in the browser: open the repository on github.com -> **Add file -> Upload files**, drag the changed files (keep folder structure; `api/index.js` must be in an `api` folder at the repo root) and commit to `main`. Then delete `backend/src/routes/products.js` on GitHub (open the file -> "..." -> Delete file).

Vercel deploys automatically on push to the connected branch.

## Verify after deploying

1. Vercel -> Deployments -> latest -> status **Ready**. In **Build Logs**, both `npm ci` runs and `vite build` must succeed.
2. `https://mata-store-new.vercel.app/api/health` -> `{"status":"ok","firebase":"ready"}`.
   - `"firebase":"misconfigured"` means the Firebase variable is missing, empty, set for the wrong environment, or invalid; fix it and redeploy. (Runtime Logs show the reason, never the value.)
3. `https://mata-store-new.vercel.app/api/products` -> `{"products":[ ... ]}` (an empty list is valid if no product is active).
4. Open the storefront, add a product to the cart, check shipping (free at a merchandise subtotal of 1000 EGP or more).
5. Open `/admin`, sign in with an admin account, confirm products/orders load.

If `/api/health` itself returns a Vercel error page, open Deployments -> Runtime Logs and read the first error.

## Local development

```
npm run install:all
cd backend && cp .env.example .env   # fill in values; .env is git-ignored
npm run dev:backend                  # API on :3000
npm run dev:frontend                 # Vite on :5173, proxies /api to :3000
npm test                             # backend tests
```

## Security notes

- Never commit `.env`, service-account JSON files, or private keys. `.gitignore` already excludes them.
- The admin API fails closed: a missing/invalid Firebase configuration returns 401, never access.
- If a `.env` file containing a Cloudinary secret was ever shared (for example inside a ZIP), rotate that secret in the Cloudinary console and update `CLOUDINARY_API_SECRET` in Vercel.
