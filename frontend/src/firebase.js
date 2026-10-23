import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Public web-app identifiers from Firebase Console > Project settings > General > Your apps > Web app.
// Vite replaces import.meta.env.VITE_* at BUILD time, so on Vercel they must be set in Project Settings
// (Production + Preview) BEFORE the build, and changing them needs a redeploy.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missing = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key)

// If a variable is missing, getAuth() throws auth/invalid-api-key while this module loads, and because
// this module is imported by the entry bundle that blanked the WHOLE site, storefront included.
// Instead, export auth = null and let the admin page explain exactly what is missing.
export const firebaseConfigError = missing.length
  ? `إعدادات Firebase ناقصة في عملية البناء: ${[
      ['apiKey', 'VITE_FIREBASE_API_KEY'], ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],
      ['projectId', 'VITE_FIREBASE_PROJECT_ID'], ['appId', 'VITE_FIREBASE_APP_ID'],
    ].filter(([key]) => missing.includes(key)).map(([, name]) => name).join(', ')}`
  : ''

if (firebaseConfigError) console.error('Firebase config missing:', missing.join(', '))

let authInstance = null
if (!firebaseConfigError) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  authInstance = getAuth(app)
}
export const auth = authInstance
