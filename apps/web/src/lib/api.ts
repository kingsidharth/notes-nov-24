import { createNotesClient } from "@notes/shared";

/** Browsers cap keepalive request bodies at 64 KiB (shared across in-flight requests). */
const KEEPALIVE_BODY_LIMIT = 60_000;

type TokenGetter = () => Promise<string | null>;

let getAuthToken: TokenGetter = async () => null;

/**
 * Registers the source of the session token sent with every API request.
 * `<AuthBridge/>` wires Clerk's `getToken` in here; Clerk caches and refreshes
 * the token, so asking per request is cheap and never sends a stale one.
 */
export function setAuthTokenGetter(getter: TokenGetter) {
  getAuthToken = getter;
}

/**
 * Adds `Authorization: Bearer <token>` when signed in. Writes use `keepalive`
 * when small enough, so an autosave fired from `beforeunload`/`visibilitychange`
 * still reaches the server after the tab closes.
 */
async function authorizedFetch(url: string, init: RequestInit) {
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const isWrite = init.method !== undefined && init.method !== "GET";
  const bodySize = typeof init.body === "string" ? init.body.length : 0;
  return fetch(url, { ...init, headers, keepalive: isWrite && bodySize < KEEPALIVE_BODY_LIMIT });
}

/** Same-origin: Vite proxies /api in dev, the server serves the app in production. */
export const notesApi = createNotesClient({ fetch: authorizedFetch });
