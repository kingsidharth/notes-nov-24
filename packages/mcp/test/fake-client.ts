import { ApiError, toExcerpt, type Note, type NotesClient } from "@notes/shared";

/** In-memory NotesClient mirroring the REST API's semantics (ordering, 404s). */
export function createFakeNotesClient(seed: Partial<Note>[] = []): NotesClient & { notes: Map<string, Note> } {
  const notes = new Map<string, Note>();
  let tick = Date.parse("2026-01-01T00:00:00.000Z");
  const now = () => new Date((tick += 1000)).toISOString();

  const put = (input: Partial<Note>): Note => {
    const ts = now();
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      content: "",
      pinned: false,
      createdAt: ts,
      updatedAt: ts,
      ...input,
    };
    notes.set(note.id, note);
    return note;
  };
  seed.forEach(put);

  const mustGet = (id: string) => {
    const note = notes.get(id);
    if (!note) throw new ApiError(404, "not_found", "Note not found");
    return note;
  };

  return {
    notes,
    async list({ q } = {}) {
      const needle = q?.toLowerCase();
      return [...notes.values()]
        .filter((n) => !needle || `${n.title}\n${n.content}`.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
        .map(({ content, ...rest }) => ({ ...rest, excerpt: toExcerpt(content) }));
    },
    async get(id) {
      return mustGet(id);
    },
    async create(input = {}) {
      return put({ title: input.title ?? "", content: input.content ?? "", pinned: input.pinned ?? false });
    },
    async update(id, patch) {
      const note = { ...mustGet(id), ...patch, updatedAt: now() };
      notes.set(id, note);
      return note;
    },
    async remove(id) {
      mustGet(id);
      notes.delete(id);
    },
  };
}
