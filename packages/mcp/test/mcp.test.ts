import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ApiError } from "@notes/shared";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createMcpFetchHandler, timingSafeEqualStrings, type McpFetchHandler } from "../src";
import { createFakeNotesClient } from "./fake-client";

const TOKEN = "s3cret-token";
const URL_ = "http://notes.test/mcp";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let nextId = 1;
function rpcRequest(method: string, params: unknown = {}, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request(URL_, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

async function rpc(handler: McpFetchHandler, method: string, params?: unknown) {
  const res = await handler(rpcRequest(method, params));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get("mcp-session-id")).toBeNull();
  const body = (await res.json()) as { result?: any; error?: any };
  expect(body.error).toBeUndefined();
  return body.result;
}

const call = (handler: McpFetchHandler, name: string, args: Record<string, unknown> = {}) =>
  rpc(handler, "tools/call", { name, arguments: args });

const EXPECTED_TOOLS = [
  "list_notes",
  "search_notes",
  "get_note",
  "create_note",
  "update_note",
  "pin_note",
  "unpin_note",
  "delete_note",
];

let client: ReturnType<typeof createFakeNotesClient>;
let handler: McpFetchHandler;

beforeEach(() => {
  client = createFakeNotesClient([
    { title: "Groceries", content: "- milk\n- **eggs**" },
    { title: "Trip plan", content: "# Lisbon\nBook the tram tour", pinned: true },
  ]);
  handler = createMcpFetchHandler({ client, authToken: TOKEN });
});

describe("protocol", () => {
  test("initialize advertises the notes server with tools", async () => {
    const result = await rpc(handler, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(result.serverInfo.name).toBe("notes");
    expect(result.capabilities.tools).toBeDefined();
  });

  test("tools/list returns all 8 tools with annotations and one-line descriptions", async () => {
    const { tools } = await rpc(handler, "tools/list");
    expect(tools.map((t: any) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.description).not.toContain("\n");
      expect(tool.outputSchema?.type).toBe("object");
      const a = tool.annotations;
      expect(typeof a.title).toBe("string");
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint"]) {
        expect(typeof a[hint]).toBe("boolean");
      }
      expect(a.openWorldHint).toBe(false);
      expect(a.destructiveHint).toBe(tool.name === "delete_note");
      expect(a.readOnlyHint).toBe(["list_notes", "search_notes", "get_note"].includes(tool.name));
    }
  });
});

describe("tools/call", () => {
  test("list_notes puts pinned first", async () => {
    const res = await call(handler, "list_notes");
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent.count).toBe(2);
    expect(res.structuredContent.notes.map((n: any) => n.title)).toEqual(["Trip plan", "Groceries"]);
    expect(JSON.parse(res.content[0].text)).toEqual(res.structuredContent);
  });

  test("create_note then get_note returns markdown content", async () => {
    const created = await call(handler, "create_note", { title: "Ideas", content: "## One\n- [ ] ship" });
    expect(created.structuredContent).toMatchObject({ title: "Ideas", pinned: false });
    const got = await call(handler, "get_note", { id: created.structuredContent.id });
    expect(got.structuredContent.content).toBe("## One\n- [ ] ship");
  });

  test("create_note with no arguments uses defaults", async () => {
    const created = await call(handler, "create_note");
    expect(created.structuredContent).toMatchObject({ title: "", content: "", pinned: false });
  });

  test("search_notes matches title or content", async () => {
    const byContent = await call(handler, "search_notes", { query: "tram" });
    expect(byContent.structuredContent.notes.map((n: any) => n.title)).toEqual(["Trip plan"]);
    const byTitle = await call(handler, "search_notes", { query: "grocer" });
    expect(byTitle.structuredContent.notes[0].excerpt).toBe("milk eggs");
    const none = await call(handler, "search_notes", { query: "zzz" });
    expect(none.structuredContent).toEqual({ notes: [], count: 0 });
  });

  test("update_note replaces only the fields given", async () => {
    const [groceries] = await client.list({ q: "Groceries" });
    const res = await call(handler, "update_note", { id: groceries!.id, content: "- bread" });
    expect(res.structuredContent).toMatchObject({ title: "Groceries", content: "- bread" });
  });

  test("update_note with no fields is a tool error", async () => {
    const [groceries] = await client.list({ q: "Groceries" });
    const res = await call(handler, "update_note", { id: groceries!.id });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("at least one field");
  });

  test("pin_note and unpin_note toggle pinned", async () => {
    const [groceries] = await client.list({ q: "Groceries" });
    const pinned = await call(handler, "pin_note", { id: groceries!.id });
    expect(pinned.structuredContent.pinned).toBe(true);
    const listed = await call(handler, "list_notes");
    expect(listed.structuredContent.notes[0].title).toBe("Groceries"); // most recently updated pin
    const unpinned = await call(handler, "unpin_note", { id: groceries!.id });
    expect(unpinned.structuredContent.pinned).toBe(false);
  });

  test("delete_note removes the note", async () => {
    const [groceries] = await client.list({ q: "Groceries" });
    const res = await call(handler, "delete_note", { id: groceries!.id });
    expect(res.structuredContent).toEqual({ id: groceries!.id, deleted: true });
    expect(client.notes.has(groceries!.id)).toBe(false);
  });

  test.each(["get_note", "update_note", "pin_note", "delete_note"])(
    "%s on a missing note returns isError 'Note not found'",
    async (name) => {
      const args = name === "update_note" ? { id: MISSING_ID, title: "x" } : { id: MISSING_ID };
      const res = await call(handler, name, args);
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toBe("Note not found");
      expect(res.structuredContent).toBeUndefined();
    },
  );

  test("invalid id is a tool error, not a protocol error", async () => {
    const res = await call(handler, "get_note", { id: "not-a-uuid" });
    expect(res.isError).toBe(true);
  });

  test("unexpected API failures become tool errors", async () => {
    client.list = async () => {
      throw new ApiError(500, "internal_error", "Something went wrong");
    };
    const res = await call(handler, "list_notes");
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("Notes API error (500 internal_error): Something went wrong");
  });
});

describe("http + auth", () => {
  test("missing bearer returns 401 with WWW-Authenticate", async () => {
    const res = await handler(rpcRequest("tools/list", {}, null));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="notes"');
    expect(((await res.json()) as any).error).toBe("unauthorized");
  });

  test("wrong bearer returns 401 invalid_token", async () => {
    const res = await handler(rpcRequest("tools/list", {}, "nope"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="notes", error="invalid_token"');
  });

  test.each(["GET", "DELETE"])("%s returns 405 with Allow: POST", async (method) => {
    const res = await handler(new Request(URL_, { method, headers: { Authorization: `Bearer ${TOKEN}` } }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  test("no authToken: requests allowed, warns exactly once", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const open = createMcpFetchHandler({ client });
      for (let i = 0; i < 2; i++) {
        const res = await open(rpcRequest("tools/list", {}, null));
        expect(res.status).toBe(200);
      }
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("timingSafeEqualStrings", async () => {
    expect(await timingSafeEqualStrings("abc", "abc")).toBe(true);
    expect(await timingSafeEqualStrings("abc", "abd")).toBe(false);
    expect(await timingSafeEqualStrings("abc", "abcd")).toBe(false);
  });
});

describe("SDK client end to end", () => {
  let mcp: Client;

  beforeEach(async () => {
    mcp = new Client({ name: "e2e", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(URL_), {
      fetch: (url, init) => handler(new Request(url, init)),
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    });
    await mcp.connect(transport);
  });

  afterEach(() => mcp.close());

  test("lists tools and round-trips a note", async () => {
    const { tools } = await mcp.listTools();
    expect(tools).toHaveLength(8);
    const created: any = await mcp.callTool({ name: "create_note", arguments: { title: "E2E", pinned: true } });
    expect(created.structuredContent.pinned).toBe(true);
    const missing: any = await mcp.callTool({ name: "get_note", arguments: { id: MISSING_ID } });
    expect(missing.isError).toBe(true);
  });
});
