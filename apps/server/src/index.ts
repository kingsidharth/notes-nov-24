import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { API_PREFIX } from "@notes/shared";
import { serveStatic } from "hono/bun";
import { openDb } from "./db";
import { createApp } from "./app";
import { createNotesRepo } from "./notes-repo";

const port = Number(process.env.PORT ?? 4310);
const hostname = process.env.HOST ?? "0.0.0.0";
const dbPath = resolve(process.env.DATABASE_PATH ?? resolve(import.meta.dir, "../data/notes.db"));
const corsOrigin = process.env.CORS_ORIGIN?.split(",") ?? "*";

const db = openDb(dbPath);
const app = createApp({ repo: createNotesRepo(db), corsOrigin });

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
console.log(`notes api on http://${hostname}:${server.port} (db: ${dbPath})`);

function shutdown() {
  server.stop();
  db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
