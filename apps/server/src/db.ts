import type { Client } from "@libsql/client";

export type Db = Client;

const MIGRATIONS = [
  [
    `CREATE TABLE IF NOT EXISTS notes (
       id         TEXT PRIMARY KEY,
       title      TEXT NOT NULL DEFAULT '',
       content    TEXT NOT NULL DEFAULT '',
       pinned     INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS notes_sort_idx ON notes (pinned DESC, updated_at DESC)`,
  ],
  // 2: accounts. Users are created on their first authenticated request and
  // every note belongs to one. Pre-auth notes keep user_id NULL (hidden).
  [
    `CREATE TABLE IF NOT EXISTS users (
       id            TEXT PRIMARY KEY,
       clerk_user_id TEXT NOT NULL UNIQUE,
       email         TEXT,
       name          TEXT,
       created_at    TEXT NOT NULL,
       updated_at    TEXT NOT NULL
     )`,
    `ALTER TABLE notes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE`,
    `CREATE INDEX IF NOT EXISTS notes_user_sort_idx ON notes (user_id, pinned DESC, updated_at DESC)`,
  ],
];

/**
 * Applies pending migrations, tracked in a `_migrations` table. (Turso rejects
 * `PRAGMA user_version = N`, so the version can't live there.) Every statement
 * is idempotent, so concurrent cold starts racing on the same version are safe.
 * Works the same against a local file, `:memory:` and a remote Turso database.
 */
export async function migrate(db: Db): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const { rows } = await db.execute("SELECT COALESCE(MAX(version), 0) AS v FROM _migrations");
  const version = Number(rows[0]?.v ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.batch(
      [
        ...MIGRATIONS[i]!,
        {
          sql: "INSERT OR IGNORE INTO _migrations (version, applied_at) VALUES (?, ?)",
          args: [i + 1, new Date().toISOString()],
        },
      ],
      "write",
    );
  }
}

/** Resolves connection settings: Turso when configured, else a local SQLite file. */
export function dbConfigFromEnv(env: Record<string, string | undefined>, localPath: string) {
  const url = env.TURSO_DATABASE_URL ?? env.DATABASE_URL ?? `file:${localPath}`;
  return { url, authToken: env.TURSO_AUTH_TOKEN };
}

/**
 * Memoized migration for serverless cold starts: runs once on first use, and a
 * failure is retried on the next request instead of crashing the process.
 */
export function lazyMigrate(db: Db): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () =>
    (pending ??= migrate(db).catch((err) => {
      pending = undefined;
      throw err;
    }));
}
