<img src="assets/icon.svg" width="64" height="64" alt="">

# Notes

Markdown notes with one live editing surface: markdown renders as you type. Private per user, and exposed to AI clients as a remote MCP server.

**Live:** https://notes-nov-24.vercel.app · **MCP:** `https://notes-nov-24.vercel.app/mcp`

| Layer | Tech |
| --- | --- |
| Web | React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query, Milkdown |
| API | Hono (`apps/server`); Bun locally, a Node function on Vercel |
| Data | libSQL: a SQLite file in dev, Turso in prod |
| Auth | Clerk: sessions for the web, OAuth 2.1 for MCP |
| Shared | `packages/shared` (zod types + typed client), `packages/mcp` (MCP tools) |

## Setup

Requires [Bun](https://bun.sh) 1.3+.

```sh
bun install
bunx clerk@latest auth login     # once per machine
bunx clerk@latest env pull --file apps/server/.env.local
bunx clerk@latest env pull --file apps/web/.env.local
```

Env files are gitignored. The server needs `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`, and the web app needs `VITE_CLERK_PUBLISHABLE_KEY`. Without `TURSO_DATABASE_URL`, the API uses `apps/server/data/notes.db`.

## Running

```sh
bun run dev          # API :4310 + web :5310 (proxies /api)
bun run test         # server + MCP tests
bun run typecheck
bun run build        # web → apps/web/dist
bun run start        # one process serves API + built web on :4310
```

Open http://localhost:5310 and sign up. Clerk test emails (`…+clerk_test@example.com`) accept the code `424242`.

## API

Every route except `GET /api/health` needs `Authorization: Bearer <Clerk session token>`. A user's account is created on their first authenticated request, and notes belong to that user.

| Route | Does |
| --- | --- |
| `GET /api/me` | Current account |
| `GET /api/notes?q=` | List or search (pinned first) |
| `POST /api/notes` | Create |
| `GET / PATCH / DELETE /api/notes/:id` | Read, update, delete |

From TypeScript, use `createNotesClient` from `@notes/shared`; its responses are validated against the same schemas the server uses.

## MCP

Add `https://notes-nov-24.vercel.app/mcp` to Claude, ChatGPT or any MCP client. It signs in through Clerk (OAuth, discovered from the 401 challenge), and the tools act as that user: `list_notes`, `search_notes`, `get_note`, `create_note`, `update_note`, `pin_note`, `unpin_note`, `delete_note`. The companion skill lives in `plugins/notes/`.

## Production

Hosted on Vercel (project `notes-nov-24`, region `bom1`), with Turso DB `notes-nov-24` (Mumbai) and the Clerk app `notes nov 24`.

```sh
vercel deploy --prod
```

`vercel.json` runs `bun run build:vercel`, which bundles the SPA as static files plus one Node function. That function serves `/api/*`, `/mcp` and `/.well-known/*`.

Vercel env (production + preview):

| Var | Source |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | `turso db show notes-nov-24 --url`, `turso db tokens create notes-nov-24` |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` | `bunx clerk@latest env pull --print` |
| `CLERK_AUTHORIZED_PARTIES` | `https://notes-nov-24.vercel.app` (prod only) |

Migrations run on the first request after a cold start; they're idempotent and tracked in `_migrations`.

**Not yet set up:**
- Git → Vercel auto-deploy: run `vercel git connect`.
- A Clerk production instance, which needs a custom domain; until then the site runs on Clerk's development instance.
