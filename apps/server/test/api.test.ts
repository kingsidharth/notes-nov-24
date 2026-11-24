import { createNotesClient, toExcerpt, type Note } from "@notes/shared";
import { beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { createClient } from "@libsql/client";
import { lazyMigrate, migrate } from "../src/db";
import { createNotesRepo } from "../src/notes-repo";

let api: ReturnType<typeof createNotesClient>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const db = createClient({ url: ":memory:" });
  await migrate(db);
  app = createApp({ repo: createNotesRepo(db), mcpAuthToken: "test-token" });
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

  it("drops html line breaks, table separators, rules and escapes", () => {
    expect(toExcerpt("milk\n\n<br />\n\n| A | B |\n| --- | :-: |\n| 1 | 2 |\n\n---\n\n100\\% \\*ok\\*")).toBe(
      "milk A B 1 2 100% ok",
    );
  });
});

describe("mcp endpoint", () => {
  const rpc = (body: unknown, token = "test-token") =>
    app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it("rejects requests without the bearer token", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("creates a note through MCP that the REST API then serves", async () => {
    const res = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_note", arguments: { title: "From MCP", content: "# hi" } },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { isError?: boolean; structuredContent: Note } };
    expect(body.result.isError).toBeFalsy();
    const created = body.result.structuredContent;
    expect(await api.get(created.id)).toMatchObject({ title: "From MCP", content: "# hi" });

    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.map((t) => t.name)).toContain("search_notes");
  });
});

describe("lazyMigrate", () => {
  it("retries after a failure instead of caching the rejection", async () => {
    const db = createClient({ url: ":memory:" });
    let calls = 0;
    const flaky = {
      ...db,
      execute: (...args: Parameters<typeof db.execute>) =>
        ++calls === 1 ? Promise.reject(new Error("cold DB")) : db.execute(...args),
      batch: db.batch.bind(db),
    } as typeof db;
    const ready = lazyMigrate(flaky);
    await expect(ready()).rejects.toThrow("cold DB");
    await ready();
    await ready();
    expect(calls).toBe(2);
  });
});
