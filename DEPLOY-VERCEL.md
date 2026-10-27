# Deploy MATA Store to Vercel

## Architecture

- Set the Vercel Root Directory to the repository root (the folder containing `vercel.json`, `api/`, `backend/`, and `frontend/`).
- Vite builds the frontend to `frontend/dist`.
- `api/index.js` exports the Express app from `backend/app.js` as a Vercel Function.
- Firestore stores products, orders, reviews, and site settings. Firebase Auth authenticates admins. Cloudinary handles media uploads.

## Vercel settings

The repository config defines these values; if entering them manually use:

- Framework Preset: Other
- Install Command: `npm run install:all`
- Build Command: `npm run build`
- Output Directory: `frontend/dist`
- Node.js: 22.x

## Environment variables

Add variables in Vercel Project Settings for Preview and Production. Never commit real `.env` files or private keys.

### Server-only variables

- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON as one-line JSON (recommended), OR configure the separate credential variables supported by `backend/src/database/credentials.js`.
- `ADMIN_UIDS`: comma-separated Firebase Authentication UIDs permitted to administer the store.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: required for uploads. Keep the secret server-side.
- `FRONTEND_ORIGIN`: optional allowed origin(s), comma-separated. For a same-origin deployment this can normally be omitted.
- `MAX_VIDEO_UPLOAD_MB`: optional upload limit.

### Frontend Firebase configuration

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

These `VITE_` values are public client configuration and are embedded at build time. Do not put service-account credentials or Cloudinary secrets in any `VITE_` variable. Do not set `VITE_API_URL` for the same-domain deployment. Redeploy after changing build-time variables.

## Local checks

```sh
npm run install:all
npm test
npm run build
```

For local development, copy `backend/.env.example` to `backend/.env` and configure local credentials. Run `npm run dev:backend` and `npm run dev:frontend` in separate terminals. Vite proxies `/api` requests to port 3000.

## Post-deployment checks

1. `/` loads the storefront.
2. `/api/health` returns JSON and reports Firebase as `ready` only when Admin credentials are configured.
3. `/api/products` returns product JSON.
4. `/admin` loads the admin app and admin endpoints reject users not on the `ADMIN_UIDS` allow-list.
5. Test a cash-on-delivery order and confirm the server calculates the price and checks stock.
6. Test an image upload and verify it is stored in Cloudinary.

If the API fails, inspect Vercel Function logs and verify the root directory and environment variables. Do not disable Firebase rules or make admin endpoints public as a workaround.
