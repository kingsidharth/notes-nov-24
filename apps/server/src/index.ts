import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { API_PREFIX } from "@notes/shared";
import { serveStatic } from "hono/bun";
import { createApp } from "./app";
import { dbConfigFromEnv, migrate } from "./db";
import { createNotesRepo } from "./notes-repo";

// Local / self-hosted entry (Bun). Vercel uses ./vercel.ts instead.
const port = Number(process.env.PORT ?? 4310);
const hostname = process.env.HOST ?? "0.0.0.0";
const localDbPath = resolve(process.env.DATABASE_PATH ?? resolve(import.meta.dir, "../data/notes.db"));
const corsOrigin = process.env.CORS_ORIGIN?.split(",") ?? "*";

const dbConfig = dbConfigFromEnv(process.env, localDbPath);
if (dbConfig.url.startsWith("file:")) mkdirSync(resolve(localDbPath, ".."), { recursive: true });
const db = createClient(dbConfig);
await migrate(db);

const app = createApp({
  repo: createNotesRepo(db),
  corsOrigin,
  mcpAuthToken: process.env.MCP_AUTH_TOKEN,
});

// In production the API also serves the built web app (single process, single port).
const webDist = resolve(import.meta.dir, "../../web/dist");
if (process.env.NODE_ENV === "production" && existsSync(webDist)) {
  const isApi = (path: string) => path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
  const assets = serveStatic({ root: webDist });
  const spaFallback = serveStatic({ root: webDist, path: "index.html" });
  // Unknown /api/* paths must still get the JSON 404, not index.html.
  app.use("/*", (c, next) => (isApi(c.req.path) ? next() : assets(c, next)));
  app.get("/*", (c, next) => (isApi(c.req.path) ? next() : spaFallback(c, next)));
}

const server = Bun.serve({ fetch: app.fetch, port, hostname });
const where = dbConfig.url.startsWith("file:") ? dbConfig.url : new URL(dbConfig.url).host;
console.log(`notes api on http://${hostname}:${server.port} (db: ${where})`);

function shutdown() {
  server.stop();
  db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
