<img src="assets/icon.svg" width="64" height="64" alt="">

# Notes

A markdown note taker with a single live editing surface: markdown renders as you type, with no separate source and preview modes. Responsive from phone to desktop, with light and dark themes.

## Stack

| Layer | Tech |
| --- | --- |
| Runtime / package manager | [Bun](https://bun.sh) workspaces |
| Shared contract | `packages/shared`: zod schemas → TS types, route map, typed API client |
| API | `apps/server`: Hono; `Bun.serve` locally, a Node function on Vercel |
| Database | libSQL: a local SQLite file in dev, [Turso](https://turso.tech) in production |
| Web | `apps/web`: React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query, react-router |
| Editor | Milkdown Crepe (ProseMirror + remark); notes are stored as plain markdown |

## Getting started

```sh
bun install
bun run dev          # API on :4310, web on :5310 (proxies /api)
```

Open http://localhost:5310.

```sh
bun run test         # API tests (bun test)
bun run typecheck    # tsc across all packages
bun run build        # builds apps/web/dist
bun run start        # production: one process serves the API + built web app on :4310
```

The server reads these environment variables, all optional:

| Variable | Default |
| --- | --- |
| `PORT` | `4310` |
| `HOST` | `0.0.0.0` |
| `DATABASE_PATH` | `apps/server/data/notes.db` (used when no Turso URL is set) |
| `TURSO_DATABASE_URL` | unset; `libsql://…` switches to Turso |
| `TURSO_AUTH_TOKEN` | unset |
| `MCP_AUTH_TOKEN` | unset, so `/mcp` is open (a warning is logged) |
| `CORS_ORIGIN` | `*` (comma-separated list) |

## API

All bodies are JSON, and errors are always `{ "error": { "code", "message", "issues?" } }`.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{ ok: true }` |
| GET | `/api/notes` | `?q=search` | `{ notes: NoteSummary[] }`, pinned first, then most recently updated |
| POST | `/api/notes` | `{ title?, content?, pinned? }` | `201 Note` |
| GET | `/api/notes/:id` | | `Note` |
| PATCH | `/api/notes/:id` | any of `{ title, content, pinned }` | `Note` |
| DELETE | `/api/notes/:id` | | `204` |

### Reusing the API from TypeScript

```ts
import { createNotesClient } from "@notes/shared";

const notes = createNotesClient({ baseUrl: "http://localhost:4310" });
const note = await notes.create({ title: "Hello", content: "# Hi" });
await notes.update(note.id, { pinned: true });
const results = await notes.list({ q: "hello" });
```

The client validates responses against the same zod schemas the server uses. It throws a typed `ApiError` carrying `status`, `code` and `issues`.

### MCP

`POST /mcp` is the remote MCP endpoint, mounted in the same server. Clients send `Authorization: Bearer $MCP_AUTH_TOKEN`. `packages/mcp` exposes the notes to AI clients as a remote MCP server: stateless Streamable HTTP with bearer auth and 8 tools. See [packages/mcp/README.md](packages/mcp/README.md).

## Deploying to Vercel

`vercel.json` runs `bun run build:vercel`. That script ([scripts/build-vercel.ts](scripts/build-vercel.ts)) writes a Build Output API bundle with two parts:
- the SPA, as static files;
- a single bundled Node function. `/api/*` and `/mcp` route to it, and every other path falls back to `index.html`.

The function uses libSQL's HTTP client, so production needs a Turso database. Set these on the Vercel project:

```sh
vercel env add TURSO_DATABASE_URL production   # libsql://<db>-<org>.turso.io
vercel env add TURSO_AUTH_TOKEN production     # turso db tokens create <db>
vercel env add MCP_AUTH_TOKEN production       # e.g. openssl rand -hex 32
vercel deploy --prod
```

Migrations run on the first request after each cold start. They're idempotent, tracked with `PRAGMA user_version`.

## Layout

```
packages/shared   schemas.ts, routes.ts, client.ts, excerpt.ts
apps/server       db.ts (migrations), notes-repo.ts, app.ts (routes), index.ts (Bun.serve)
apps/web          features/notes/{queries,mutations,cache,use-note-autosave}.ts,
                  features/notes/components/*, features/notes/editor/* (lazy Milkdown chunk)
```
