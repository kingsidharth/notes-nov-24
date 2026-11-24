import { createNotesClient, type Note } from "@notes/shared";
import { beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { createNotesRepo, toExcerpt } from "../src/notes-repo";

let api: ReturnType<typeof createNotesClient>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({ repo: createNotesRepo(openDb(":memory:")) });
  // Exercise the real shared client against the in-process app.
  api = createNotesClient({
    baseUrl: "http://test",
    fetch: (url, init) => Promise.resolve(app.request(url, init)),
  });
});

describe("notes api", () => {
  it("creates, reads, updates, lists and deletes a note", async () => {
    const created = await api.create({ title: "Hello", content: "# Hi\n\nSome **bold** text" });
    expect(created).toMatchObject({ title: "Hello", pinned: false });

    expect(await api.get(created.id)).toEqual(created);

    const updated = await api.update(created.id, { content: "changed", pinned: true });
    expect(updated).toMatchObject({ title: "Hello", content: "changed", pinned: true });
    expect(updated.updatedAt >= created.updatedAt).toBe(true);

    const list = await api.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, excerpt: "changed" });
    expect(list[0]).not.toHaveProperty("content");

    await api.remove(created.id);
    await expect(api.get(created.id)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("sorts pinned first, then most recently updated", async () => {
    const a: Note = await api.create({ title: "a" });
    const b = await api.create({ title: "b" });
    await api.create({ title: "c", pinned: true });
    await new Promise((r) => setTimeout(r, 2));
    await api.update(a.id, { title: "a2" });
    expect((await api.list()).map((n) => n.title)).toEqual(["c", "a2", "b"]);
    void b;
  });

  it("searches title and content, treating % and _ literally", async () => {
    await api.create({ title: "Groceries", content: "milk, eggs" });
    await api.create({ title: "Work", content: "100% done with task_1" });
    expect((await api.list({ q: "milk" })).map((n) => n.title)).toEqual(["Groceries"]);
    expect((await api.list({ q: "work" })).map((n) => n.title)).toEqual(["Work"]);
    expect((await api.list({ q: "%" })).map((n) => n.title)).toEqual(["Work"]);
    expect((await api.list({ q: "k_1" })).map((n) => n.title)).toEqual(["Work"]);
  });

  it("rejects invalid input with a uniform error shape", async () => {
    await expect(api.get("not-a-uuid")).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    });
    const note = await api.create();
    await expect(api.update(note.id, {})).rejects.toMatchObject({ status: 400 });
    const res = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: 42 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "validation_error" } });
  });

  it("returns 404 json for unknown notes and routes", async () => {
    await expect(api.remove(crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
  });
});

describe("toExcerpt", () => {
  it("strips common markdown syntax", () => {
    expect(
      toExcerpt("# Title\n\n- [x] done item\n> quote with [link](http://x)\n```js\ncode\n```\n`inline` **b**"),
    ).toBe("Title done item quote with link inline b");
  });
});
