import { randomUUID } from "node:crypto";
import type { Note, NoteSummary } from "@notes/shared";
import type { Db } from "./db";

interface NoteRow {
  id: string;
  title: string;
  content: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

const EXCERPT_LENGTH = 160;

/** Rough markdown → plain text, good enough for list previews. */
export function toExcerpt(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\[[ xX]\]\s+/g, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_LENGTH);
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

export function createNotesRepo(db: Db) {
  const stmts = {
    list: db.prepare(
      `SELECT id, title, substr(content, 1, 2000) AS content, pinned, created_at, updated_at
         FROM notes ORDER BY pinned DESC, updated_at DESC`,
    ),
    search: db.prepare(
      `SELECT id, title, substr(content, 1, 2000) AS content, pinned, created_at, updated_at
         FROM notes
        WHERE title LIKE $q ESCAPE '\\' OR content LIKE $q ESCAPE '\\'
        ORDER BY pinned DESC, updated_at DESC`,
    ),
    get: db.prepare(`SELECT * FROM notes WHERE id = ?`),
    insert: db.prepare(
      `INSERT INTO notes (id, title, content, pinned, created_at, updated_at)
       VALUES ($id, $title, $content, $pinned, $now, $now)`,
    ),
    update: db.prepare(
      `UPDATE notes SET
         title      = COALESCE($title, title),
         content    = COALESCE($content, content),
         pinned     = COALESCE($pinned, pinned),
         updated_at = $now
       WHERE id = $id`,
    ),
    remove: db.prepare(`DELETE FROM notes WHERE id = ?`),
  };

  return {
    list(q?: string): NoteSummary[] {
      const rows = (
        q ? stmts.search.all({ q: `%${escapeLike(q)}%` }) : stmts.list.all()
      ) as unknown as NoteRow[];
      return rows.map((row) => {
        const { content, ...rest } = toNote(row);
        return { ...rest, excerpt: toExcerpt(content) };
      });
    },

    get(id: string): Note | null {
      const row = stmts.get.get(id) as NoteRow | undefined;
      return row ? toNote(row) : null;
    },

    create(input: { title: string; content: string; pinned: boolean }): Note {
      const id = randomUUID();
      stmts.insert.run({
        id,
        title: input.title,
        content: input.content,
        pinned: input.pinned ? 1 : 0,
        now: new Date().toISOString(),
      });
      return this.get(id)!;
    },

    update(
      id: string,
      patch: { title?: string; content?: string; pinned?: boolean },
    ): Note | null {
      const result = stmts.update.run({
        id,
        title: patch.title ?? null,
        content: patch.content ?? null,
        pinned: patch.pinned === undefined ? null : patch.pinned ? 1 : 0,
        now: new Date().toISOString(),
      });
      return result.changes ? this.get(id) : null;
    },

    remove(id: string): boolean {
      return stmts.remove.run(id).changes > 0;
    },
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
