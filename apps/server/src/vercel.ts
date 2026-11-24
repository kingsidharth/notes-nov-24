import { createClient } from "@libsql/client/web";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app";
import { clerkAuthFromEnv } from "./auth";
import { lazyMigrate } from "./db";
import { createNotesRepo } from "./notes-repo";
import { createUsersRepo } from "./users-repo";

// Vercel Node function entry. Uses libSQL's pure-JS HTTP client (no native
// bindings), so it bundles cleanly; requires a remote Turso database.
const url = process.env.TURSO_DATABASE_URL;

const misconfigured = (message: string) =>
  new Hono().all("*", (c) => c.json({ error: { code: "misconfigured", message } }, 500));

function createHandlerApp() {
  if (!url) return misconfigured("TURSO_DATABASE_URL is not set");
  let auth;
  try {
    auth = clerkAuthFromEnv(process.env);
  } catch (err) {
    return misconfigured((err as Error).message);
  }
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return createApp({
    notes: createNotesRepo(db),
    users: createUsersRepo(db),
    auth,
    corsOrigin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    // First request per cold start migrates (idempotent, tracked in _migrations).
    ready: lazyMigrate(db),
  });
}

// Node (req, res) listener, the shape Vercel's Node launcher calls.
export default getRequestListener(createHandlerApp().fetch);
