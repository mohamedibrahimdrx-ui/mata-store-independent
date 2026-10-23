// Reads Firebase Admin credentials from environment variables (no dependencies, easy to test).
// Supported, in priority order:
//   1. FIREBASE_SERVICE_ACCOUNT_JSON   - the whole service-account JSON, raw or base64-encoded
//   2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ FIREBASE_PROJECT_ID)
// Returns null when neither is set (the caller then falls back to Application Default Credentials,
// e.g. GOOGLE_APPLICATION_CREDENTIALS for local development).
// Error messages never include credential values.

const DEFAULT_PROJECT_ID = "mata-store-eg";

function fixKey(key) {
  return typeof key === "string" ? key.replace(/\\n/g, "\n") : key;
}

function parseJson(raw) {
  const text = raw.trim();
  try {
    return JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8"));
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64-encoded JSON).");
  }
}

function loadFirebaseCredentials(env = process.env) {
  const projectIdFromEnv = (env.FIREBASE_PROJECT_ID || "").trim();

  if ((env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim()) {
    const json = parseJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!json || typeof json.client_email !== "string" || typeof json.private_key !== "string") {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain client_email and private_key.");
    }
    return {
      projectId: projectIdFromEnv || json.project_id || DEFAULT_PROJECT_ID,
      clientEmail: json.client_email,
      privateKey: fixKey(json.private_key),
    };
  }

  if (env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_PRIVATE_KEY) {
    if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Set both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
    }
    return {
      projectId: projectIdFromEnv || DEFAULT_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL.trim(),
      privateKey: fixKey(env.FIREBASE_PRIVATE_KEY),
    };
  }

  return null;
}

function resolveProjectId(env = process.env) {
  return (env.FIREBASE_PROJECT_ID || "").trim() || DEFAULT_PROJECT_ID;
}

module.exports = { loadFirebaseCredentials, resolveProjectId, DEFAULT_PROJECT_ID };
