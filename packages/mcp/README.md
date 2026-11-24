# @notes/mcp

Remote [MCP](https://modelcontextprotocol.io) server for the notes app. The tools are thin wrappers over `@notes/shared`'s `NotesClient`. It speaks Streamable HTTP in **stateless** mode: each POST gets a fresh server and transport, there are no session ids, and responses are JSON rather than SSE. That makes it safe to run in serverless functions (Vercel Node runtime) and in Bun.

## Tools

Clients see these as `notes:<name>`. Every tool sets `openWorldHint: false`, declares an `outputSchema`, and returns `structuredContent` plus the same data as compact JSON text.

| Tool | Description | Read-only | Destructive |
| --- | --- | :-: | :-: |
| `list_notes` | List all notes, pinned first then most recently updated, as summaries with an excerpt. | ✓ | |
| `search_notes` | Find notes whose title or content contains the query; returns summaries with an excerpt. | ✓ | |
| `get_note` | Get one note by id, including its full markdown content. | ✓ | |
| `create_note` | Create a note with an optional title, markdown content and pinned flag. | | |
| `update_note` | Update a note's title, content or pinned flag; each field you pass replaces the old value entirely. | | |
| `pin_note` | Pin a note so it is listed before unpinned notes. | | |
| `unpin_note` | Unpin a note so it is ordered by last update again. | | |
| `delete_note` | Permanently delete a note by id; this cannot be undone. | | ✓ |

API failures come back as tool results with `isError: true` and a short message, such as `Note not found`. They never surface as JSON-RPC errors.

## Mounting

```ts
import { createNotesClient } from "@notes/shared";
import { createMcpFetchHandler } from "@notes/mcp";

const handler = createMcpFetchHandler({
  client: createNotesClient({ baseUrl: "https://<host>" }), // or an in-process fetch: (url, init) => app.fetch(new Request(url, init))
  authToken: process.env.MCP_AUTH_TOKEN,
});

app.all("/mcp", (c) => handler(c.req.raw)); // Hono
```

- **POST** carries JSON-RPC. **GET** and **DELETE** (and any other method) return `405` with `Allow: POST`, since there is no SSE stream or session to manage.
- **Auth:** when `authToken` is set, requests need `Authorization: Bearer <token>`. The comparison is constant-time and uses WebCrypto. Anything else gets `401` with `WWW-Authenticate: Bearer realm="notes"`. Without `authToken` the endpoint is open, and the handler logs one warning when it is created.
- **OAuth 2.1 later:** pass `authenticate: (req) => Promise<{ ok: true, authInfo } | { ok: false, response }>` instead of `authToken`. The `authInfo` reaches tool handlers as `extra.authInfo`.
- **CORS:** browser-based clients need CORS on `/mcp`, including `Authorization` and `Mcp-Protocol-Version` in the allowed headers. Add it with your framework's middleware, which also answers the `OPTIONS` preflight.

## Client config

```json
{
  "mcpServers": {
    "notes": {
      "type": "http",
      "url": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer …" }
    }
  }
}
```

## Development

```sh
bun test           # drives createMcpFetchHandler with real JSON-RPC Requests + the SDK Client
bun run typecheck
```
