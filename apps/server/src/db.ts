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
];

/**
 * Applies pending migrations, tracked in SQLite's `user_version`. Works the same
 * against a local file, `:memory:` and a remote Turso database.
 */
export async function migrate(db: Db): Promise<void> {
  const { rows } = await db.execute("PRAGMA user_version");
  const version = Number(rows[0]?.[0] ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.batch([...MIGRATIONS[i]!, `PRAGMA user_version = ${i + 1}`], "write");
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
