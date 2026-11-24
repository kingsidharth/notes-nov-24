import { createNotesClient, toExcerpt, type Note } from "@notes/shared";
import { beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { createClient } from "@libsql/client";
import { lazyMigrate, migrate } from "../src/db";
import type { AuthProvider } from "../src/auth";
import { createNotesRepo } from "../src/notes-repo";
import { createUsersRepo } from "../src/users-repo";

/**
 * Fake Clerk: session tokens look like `session:<clerkUserId>`, OAuth access
 * tokens like `oauth:<clerkUserId>`. Profiles are loaded once per new user.
 */
const profileLoads: string[] = [];
const fakeAuth: AuthProvider = {
  issuer: "https://clerk.example.test",
  async verifySession(req) {
    const m = /^Bearer session:(\S+)$/.exec(req.headers.get("authorization") ?? "");
    return m?.[1] ?? null;
  },
  async verifyOAuth(req) {
    const m = /^Bearer oauth:(\S+)$/.exec(req.headers.get("authorization") ?? "");
    return m ? { clerkUserId: m[1]!, clientId: "client_test", scopes: ["profile"] } : null;
  },
  async loadProfile(clerkUserId) {
    profileLoads.push(clerkUserId);
    return { email: `${clerkUserId}@example.test`, name: clerkUserId.toUpperCase() };
  },
};

let db: ReturnType<typeof createClient>;
let app: ReturnType<typeof createApp>;
let api: ReturnType<typeof createNotesClient>;

const clientAs = (clerkUserId: string) =>
  createNotesClient({
    baseUrl: "http://test",
    headers: { Authorization: `Bearer session:${clerkUserId}` },
    fetch: (url, init) => Promise.resolve(app.request(url, init)),
  });

beforeEach(async () => {
  profileLoads.length = 0;
  db = createClient({ url: ":memory:" });
  await migrate(db);
  app = createApp({ notes: createNotesRepo(db), users: createUsersRepo(db), auth: fakeAuth });
  // Exercise the real shared client against the in-process app, as user "user_a".
  api = clientAs("user_a");
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
      headers: { "Content-Type": "application/json", Authorization: "Bearer session:user_a" },
      body: JSON.stringify({ title: 42 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "validation_error" } });
  });

  it("returns 404 json for unknown notes and routes", async () => {
    await expect(api.remove(crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
    const res = await app.request("/api/nope", { headers: { Authorization: "Bearer session:user_a" } });
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
  const rpc = (body: unknown, token = "oauth:user_a") =>
    app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it("challenges unauthenticated callers with the protected resource metadata URL", async () => {
    for (const token of ["", "session:user_a", "oauth-nope"]) {
      const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, token);
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe(
        'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"',
      );
    }
    const meta = await (await app.request("/.well-known/oauth-protected-resource/mcp")).json();
    expect(meta).toMatchObject({
      resource: "http://localhost/mcp",
      authorization_servers: ["https://clerk.example.test"],
    });
  });

  it("acts as the OAuth token's user and never sees other users' notes", async () => {
    await clientAs("user_b").create({ title: "B's secret" });
    const call = (name: string, args: Record<string, unknown>) =>
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });
    const listed = (await (await call("list_notes", {})).json()) as {
      result: { structuredContent: { notes: unknown[] } };
    };
    expect(listed.result.structuredContent.notes).toEqual([]);
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
    await ready(); // retried after the failure
    const afterSuccess = calls;
    await ready(); // memoized: no further DB work
    expect(calls).toBe(afterSuccess);
    expect(afterSuccess).toBeGreaterThan(1);
  });
});

describe("migrate on Turso-like databases", () => {
  it("never writes PRAGMA user_version and is idempotent", async () => {
    const db = createClient({ url: ":memory:" });
    const statements: string[] = [];
    const record = (stmt: unknown) => {
      const sql = typeof stmt === "string" ? stmt : (stmt as { sql: string }).sql;
      if (/PRAGMA\s+user_version\s*=/i.test(sql)) throw new Error("SQL not allowed statement");
      statements.push(sql);
    };
    const strict = {
      ...db,
      execute: (stmt: Parameters<typeof db.execute>[0]) => (record(stmt), db.execute(stmt)),
      batch: (stmts: Parameters<typeof db.batch>[0], mode?: Parameters<typeof db.batch>[1]) => (
        stmts.forEach(record), db.batch(stmts, mode)
      ),
    } as typeof db;
    await migrate(strict);
    await migrate(strict);
    const { rows } = await db.execute("SELECT version FROM _migrations");
    expect(rows.map((r) => Number(r.version))).toEqual([1, 2]);
  });

  it("answers unauthenticated /mcp with 401 without touching the database", async () => {
    let readyCalls = 0;
    const raw = createClient({ url: ":memory:" });
    const gated = createApp({
      notes: createNotesRepo(raw),
      users: createUsersRepo(raw),
      auth: fakeAuth,
      ready: async () => {
        readyCalls++;
      },
    });
    const res = await gated.request("/mcp", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(readyCalls).toBe(0);
  });
});

describe("accounts", () => {
  it("requires a session for every /api route except health", async () => {
    expect((await app.request("/api/health")).status).toBe(200);
    for (const path of ["/api/me", "/api/notes"]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
    }
    const forged = await app.request("/api/notes", { headers: { Authorization: "Bearer oauth:user_a" } });
    expect(forged.status).toBe(401);
  });

  it("creates the local account on the first authenticated request, once", async () => {
    const first = await app.request("/api/me", { headers: { Authorization: "Bearer session:user_new" } });
    const me = (await first.json()) as { id: string; clerkUserId: string; email: string; name: string };
    expect(me).toMatchObject({ clerkUserId: "user_new", email: "user_new@example.test", name: "USER_NEW" });
    await Promise.all([clientAs("user_new").list(), clientAs("user_new").list()]);
    const again = (await (
      await app.request("/api/me", { headers: { Authorization: "Bearer session:user_new" } })
    ).json()) as { id: string };
    expect(again.id).toBe(me.id);
    expect(profileLoads).toEqual(["user_new"]);
    const { rows } = await db.execute("SELECT count(*) AS n FROM users WHERE clerk_user_id = 'user_new'");
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("keeps each user's notes private", async () => {
    const mine = await api.create({ title: "A's note" });
    const b = clientAs("user_b");
    expect(await b.list()).toEqual([]);
    await expect(b.get(mine.id)).rejects.toMatchObject({ status: 404 });
    await expect(b.update(mine.id, { title: "hijack" })).rejects.toMatchObject({ status: 404 });
    await expect(b.remove(mine.id)).rejects.toMatchObject({ status: 404 });
    expect((await api.get(mine.id)).title).toBe("A's note");
  });
});
