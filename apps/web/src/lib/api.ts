import { createNotesClient } from "@notes/shared";

/** Browsers cap keepalive request bodies at 64 KiB (shared across in-flight requests). */
const KEEPALIVE_BODY_LIMIT = 60_000;

/**
 * Writes use `keepalive` when small enough, so an autosave fired from
 * `beforeunload`/`visibilitychange` still reaches the server after the tab closes.
 */
function fetchWithKeepalive(url: string, init: RequestInit) {
  const isWrite = init.method !== undefined && init.method !== "GET";
  const bodySize = typeof init.body === "string" ? init.body.length : 0;
  return fetch(url, { ...init, keepalive: isWrite && bodySize < KEEPALIVE_BODY_LIMIT });
}

/** Same-origin: Vite proxies /api in dev, the server serves the app in production. */
export const notesApi = createNotesClient({ fetch: fetchWithKeepalive });
