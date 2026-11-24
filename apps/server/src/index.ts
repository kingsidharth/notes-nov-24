import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
  app.use("/*", serveStatic({ root: webDist }));
  app.get("/*", serveStatic({ root: webDist, path: "index.html" }));
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
