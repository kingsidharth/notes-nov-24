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
| Auth | [Clerk](https://clerk.com): sessions for the web app, OAuth 2.1 for MCP clients |

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
| `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` | required; `bunx clerk@latest env pull` writes them to `.env.local` |
| `VITE_CLERK_PUBLISHABLE_KEY` | required at web build time |
| `CLERK_AUTHORIZED_PARTIES` | unset; comma-separated origins allowed to send session tokens |
| `CORS_ORIGIN` | `*` (comma-separated list) |

## API

All bodies are JSON, and errors are always `{ "error": { "code", "message", "issues?" } }`.

Every route except `/api/health` requires `Authorization: Bearer <Clerk session token>`. A user's local account (`users` table, keyed by Clerk user ID) is created on their first authenticated request. Notes belong to one user; a note ID from another account returns 404. `GET /api/me` returns the account.

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

`POST /mcp` is the remote MCP endpoint, mounted in the same server. It's an OAuth 2.1 protected resource with Clerk as the authorization server:

1. An unauthenticated call gets `401` with `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"`.
2. That metadata points clients at Clerk. Clerk supports dynamic client registration and client ID metadata documents, with PKCE S256 required.
3. The user signs in and consents on Clerk, and the client calls `/mcp` with the access token.
4. Tools act as that user, the same as the web app.

In MCP clients, just add the URL (`https://notes-nov-24.vercel.app/mcp`); the client handles the OAuth flow. `packages/mcp` exposes the notes to AI clients as a remote MCP server: stateless Streamable HTTP with bearer auth and 8 tools. See [packages/mcp/README.md](packages/mcp/README.md).

## Deploying to Vercel

`vercel.json` runs `bun run build:vercel`. That script ([scripts/build-vercel.ts](scripts/build-vercel.ts)) writes a Build Output API bundle with two parts:
- the SPA, as static files;
- a single bundled Node function. `/api/*` and `/mcp` route to it, and every other path falls back to `index.html`.

The function uses libSQL's HTTP client, so production needs a Turso database. Set these on the Vercel project:

```sh
vercel env add TURSO_DATABASE_URL production   # libsql://<db>-<org>.turso.io
vercel env add TURSO_AUTH_TOKEN production     # turso db tokens create <db>
vercel env add CLERK_SECRET_KEY production     # from: bunx clerk@latest env pull --print
vercel env add CLERK_PUBLISHABLE_KEY production
vercel env add VITE_CLERK_PUBLISHABLE_KEY production
vercel deploy --prod
```

Migrations run on the first request after each cold start. They're idempotent and tracked in a `_migrations` table, because Turso rejects `PRAGMA user_version` writes.

## Layout

```
packages/shared   schemas.ts, routes.ts, client.ts, excerpt.ts
apps/server       db.ts (migrations), notes-repo.ts, app.ts (routes), index.ts (Bun.serve)
apps/web          features/notes/{queries,mutations,cache,use-note-autosave}.ts,
                  features/notes/components/*, features/notes/editor/* (lazy Milkdown chunk)
```
