import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ApiError,
  createNoteInputSchema,
  listNotesQuerySchema,
  noteIdSchema,
  noteSchema,
  noteSummarySchema,
  updateNoteInputSchema,
  type NotesClient,
} from "@notes/shared";
import { z } from "zod";

export const MCP_SERVER_NAME = "notes";
export const MCP_SERVER_VERSION = "0.1.0";

// Input shapes are derived from the shared REST schemas so limits never drift.
const idShape = { id: noteIdSchema.describe("Note id (UUID)") };
const fields = updateNoteInputSchema.shape;
const titleField = fields.title.describe("Plain-text title");
const contentField = fields.content.describe("Note body in markdown");
const pinnedField = fields.pinned.describe("Pinned notes are listed first");

const listOutput = { notes: z.array(noteSummarySchema), count: z.number().int() };
const deleteOutput = { id: noteIdSchema, deleted: z.literal(true) };

function ok<T extends Record<string, unknown>>(data: T): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

/** Turn API/network failures into tool results so the model can recover. */
export function toToolError(err: unknown): CallToolResult {
  let text: string;
  if (err instanceof ApiError) {
    if (err.status === 404) text = "Note not found";
    else if (err.status === 400) text = `Invalid input: ${err.message}`;
    else text = `Notes API error (${err.status} ${err.code}): ${err.message}`;
  } else {
    text = `Notes API request failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { isError: true, content: [{ type: "text", text }] };
}

function run<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return toToolError(err);
    }
  };
}

const list = (notes: Awaited<ReturnType<NotesClient["list"]>>) =>
  ok({ notes, count: notes.length });

/**
 * Builds a fresh MCP server whose tools are thin wrappers over the shared
 * notes client. Cheap to construct; the stateless HTTP handler makes one per
 * request.
 */
export function createNotesMcpServer(client: NotesClient): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        "Notes are markdown documents. Find ids with list_notes or search_notes before get, update, pin or delete.",
    },
  );

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "List all notes, pinned first then most recently updated, as summaries with an excerpt.",
      outputSchema: listOutput,
      annotations: {
        title: "List notes",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    run(async () => list(await client.list())),
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description: "Find notes whose title or content contains the query; returns summaries with an excerpt.",
      inputSchema: {
        query: listNotesQuerySchema.shape.q.unwrap().min(1).describe("Text to match in title or content"),
      },
      outputSchema: listOutput,
      annotations: {
        title: "Search notes",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    run(async ({ query }) => list(await client.list({ q: query }))),
  );

  server.registerTool(
    "get_note",
    {
      title: "Get note",
      description: "Get one note by id, including its full markdown content.",
      inputSchema: idShape,
      outputSchema: noteSchema.shape,
      annotations: {
        title: "Get note",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    run(async ({ id }) => ok(await client.get(id))),
  );

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description: "Create a note with an optional title, markdown content and pinned flag.",
      inputSchema: {
        title: createNoteInputSchema.shape.title.describe("Plain-text title (default empty)"),
        content: createNoteInputSchema.shape.content.describe("Note body in markdown (default empty)"),
        pinned: createNoteInputSchema.shape.pinned.describe("Pin the note (default false)"),
      },
      outputSchema: noteSchema.shape,
      annotations: {
        title: "Create note",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    run(async (input) => ok(await client.create(input))),
  );

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description:
        "Update a note's title, content or pinned flag; each field you pass replaces the old value entirely.",
      // A full object (not a raw shape) so the "at least one field" rule from
      // the shared schema runs inside the SDK's input validation.
      inputSchema: z
        .object({ ...idShape, title: titleField, content: contentField, pinned: pinnedField })
        .superRefine(({ id: _id, ...patch }, ctx) => {
          const res = updateNoteInputSchema.safeParse(patch);
          if (!res.success) {
            for (const { message, path } of res.error.issues) ctx.addIssue({ code: "custom", message, path });
          }
        }),
      outputSchema: noteSchema.shape,
      annotations: {
        title: "Update note",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    run(async ({ id, ...patch }) => ok(await client.update(id, patch))),
  );

  for (const [name, pinned] of [
    ["pin_note", true],
    ["unpin_note", false],
  ] as const) {
    const title = pinned ? "Pin note" : "Unpin note";
    server.registerTool(
      name,
      {
        title,
        description: pinned
          ? "Pin a note so it is listed before unpinned notes."
          : "Unpin a note so it is ordered by last update again.",
        inputSchema: idShape,
        outputSchema: noteSchema.shape,
        annotations: {
          title,
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      run(async ({ id }) => ok(await client.update(id, { pinned }))),
    );
  }

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description: "Permanently delete a note by id; this cannot be undone.",
      inputSchema: idShape,
      outputSchema: deleteOutput,
      annotations: {
        title: "Delete note",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    run(async ({ id }) => {
      await client.remove(id);
      return ok({ id, deleted: true as const });
    }),
  );

  return server;
}
