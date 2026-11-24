import { toExcerpt, type Note, type NoteSummary } from "@notes/shared";
import type { Db } from "./db";

interface NoteRow {
  id: string;
  title: string;
  content: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SUMMARY_COLUMNS = `id, title, substr(content, 1, 2000) AS content, pinned, created_at, updated_at`;
const ORDER = `ORDER BY pinned DESC, updated_at DESC`;

/** Every query is scoped to one user: a note id from another account is "not found". */
export function createNotesRepo(db: Db) {
  async function get(userId: string, id: string): Promise<Note | null> {
    const { rows } = await db.execute({
      sql: `SELECT * FROM notes WHERE id = ? AND user_id = ?`,
      args: [id, userId],
    });
    return rows[0] ? toNote(rows[0] as unknown as NoteRow) : null;
  }

  return {
    get,

    async list(userId: string, q?: string): Promise<NoteSummary[]> {
      const { rows } = q
        ? await db.execute({
            sql: `SELECT ${SUMMARY_COLUMNS} FROM notes
                   WHERE user_id = :uid AND (title LIKE :q ESCAPE '\\' OR content LIKE :q ESCAPE '\\')
                   ${ORDER}`,
            args: { uid: userId, q: `%${escapeLike(q)}%` },
          })
        : await db.execute({
            sql: `SELECT ${SUMMARY_COLUMNS} FROM notes WHERE user_id = ? ${ORDER}`,
            args: [userId],
          });
      return rows.map((row) => {
        const { content, ...rest } = toNote(row as unknown as NoteRow);
        return { ...rest, excerpt: toExcerpt(content) };
      });
    },

    async create(
      userId: string,
      input: { title: string; content: string; pinned: boolean },
    ): Promise<Note> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO notes (id, user_id, title, content, pinned, created_at, updated_at)
              VALUES (:id, :uid, :title, :content, :pinned, :now, :now)`,
        args: {
          id,
          uid: userId,
          title: input.title,
          content: input.content,
          pinned: input.pinned ? 1 : 0,
          now,
        },
      });
      return (await get(userId, id))!;
    },

    async update(
      userId: string,
      id: string,
      patch: { title?: string; content?: string; pinned?: boolean },
    ): Promise<Note | null> {
      const { rows } = await db.execute({
        sql: `UPDATE notes SET
                title      = COALESCE(:title, title),
                content    = COALESCE(:content, content),
                pinned     = COALESCE(:pinned, pinned),
                updated_at = :now
              WHERE id = :id AND user_id = :uid
              RETURNING *`,
        args: {
          id,
          uid: userId,
          title: patch.title ?? null,
          content: patch.content ?? null,
          pinned: patch.pinned === undefined ? null : patch.pinned ? 1 : 0,
          now: new Date().toISOString(),
        },
      });
      return rows[0] ? toNote(rows[0] as unknown as NoteRow) : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const result = await db.execute({
        sql: `DELETE FROM notes WHERE id = ? AND user_id = ?`,
        args: [id, userId],
      });
      return result.rowsAffected > 0;
    },
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
