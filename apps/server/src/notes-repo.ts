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

export function createNotesRepo(db: Db) {
  async function get(id: string): Promise<Note | null> {
    const { rows } = await db.execute({ sql: `SELECT * FROM notes WHERE id = ?`, args: [id] });
    return rows[0] ? toNote(rows[0] as unknown as NoteRow) : null;
  }

  return {
    get,

    async list(q?: string): Promise<NoteSummary[]> {
      const { rows } = q
        ? await db.execute({
            sql: `SELECT ${SUMMARY_COLUMNS} FROM notes
                   WHERE title LIKE :q ESCAPE '\\' OR content LIKE :q ESCAPE '\\' ${ORDER}`,
            args: { q: `%${escapeLike(q)}%` },
          })
        : await db.execute(`SELECT ${SUMMARY_COLUMNS} FROM notes ${ORDER}`);
      return rows.map((row) => {
        const { content, ...rest } = toNote(row as unknown as NoteRow);
        return { ...rest, excerpt: toExcerpt(content) };
      });
    },

    async create(input: { title: string; content: string; pinned: boolean }): Promise<Note> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO notes (id, title, content, pinned, created_at, updated_at)
              VALUES (:id, :title, :content, :pinned, :now, :now)`,
        args: { id, title: input.title, content: input.content, pinned: input.pinned ? 1 : 0, now },
      });
      return (await get(id))!;
    },

    async update(
      id: string,
      patch: { title?: string; content?: string; pinned?: boolean },
    ): Promise<Note | null> {
      const { rows } = await db.execute({
        sql: `UPDATE notes SET
                title      = COALESCE(:title, title),
                content    = COALESCE(:content, content),
                pinned     = COALESCE(:pinned, pinned),
                updated_at = :now
              WHERE id = :id
              RETURNING *`,
        args: {
          id,
          title: patch.title ?? null,
          content: patch.content ?? null,
          pinned: patch.pinned === undefined ? null : patch.pinned ? 1 : 0,
          now: new Date().toISOString(),
        },
      });
      return rows[0] ? toNote(rows[0] as unknown as NoteRow) : null;
    },

    async remove(id: string): Promise<boolean> {
      const result = await db.execute({ sql: `DELETE FROM notes WHERE id = ?`, args: [id] });
      return result.rowsAffected > 0;
    },
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
