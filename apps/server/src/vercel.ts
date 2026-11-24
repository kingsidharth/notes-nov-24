import { createClient } from "@libsql/client/web";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app";
import { lazyMigrate } from "./db";
import { createNotesRepo } from "./notes-repo";

// Vercel Node function entry. Uses libSQL's pure-JS HTTP client (no native
// bindings), so it bundles cleanly; requires a remote Turso database.
const url = process.env.TURSO_DATABASE_URL;

function createHandlerApp() {
  if (!url) {
    return new Hono().all("*", (c) =>
      c.json({ error: { code: "misconfigured", message: "TURSO_DATABASE_URL is not set" } }, 500),
    );
  }
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return createApp({
    repo: createNotesRepo(db),
    corsOrigin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    mcpAuthToken: process.env.MCP_AUTH_TOKEN,
    // First request per cold start migrates (idempotent, via PRAGMA user_version).
    ready: lazyMigrate(db),
  });
}

// Node (req, res) listener, the shape Vercel's Node launcher calls.
export default getRequestListener(createHandlerApp().fetch);
