import type { Db } from "./db";

export interface User {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
}

export interface UserProfile {
  email: string | null;
  name: string | null;
}

interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string | null;
  name: string | null;
  created_at: string;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  clerkUserId: row.clerk_user_id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
});

export function createUsersRepo(db: Db) {
  async function findByClerkId(clerkUserId: string): Promise<User | null> {
    const { rows } = await db.execute({
      sql: `SELECT id, clerk_user_id, email, name, created_at FROM users WHERE clerk_user_id = ?`,
      args: [clerkUserId],
    });
    return rows[0] ? toUser(rows[0] as unknown as UserRow) : null;
  }

  return {
    findByClerkId,

    /**
     * Returns the local account for a Clerk user, creating it on first sight
     * (the "sign-in callback"). The profile is only fetched for new accounts,
     * and INSERT OR IGNORE makes concurrent first requests converge on one row.
     */
    async ensure(clerkUserId: string, loadProfile: () => Promise<UserProfile>): Promise<User> {
      const existing = await findByClerkId(clerkUserId);
      if (existing) return existing;
      const profile = await loadProfile().catch(() => ({ email: null, name: null }));
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT OR IGNORE INTO users (id, clerk_user_id, email, name, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), clerkUserId, profile.email, profile.name, now, now],
      });
      return (await findByClerkId(clerkUserId))!;
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
