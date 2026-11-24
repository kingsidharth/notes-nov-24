import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

export type Db = Database;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS notes (
     id         TEXT PRIMARY KEY,
     title      TEXT NOT NULL DEFAULT '',
     content    TEXT NOT NULL DEFAULT '',
     pinned     INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS notes_sort_idx ON notes (pinned DESC, updated_at DESC);`,
];

/** Opens (or creates) the SQLite database and applies pending migrations. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

  const version = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  );
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}
