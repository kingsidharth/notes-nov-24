import { zValidator } from "@hono/zod-validator";
import { createMcpFetchHandler, type McpAuthenticator } from "@notes/mcp";
import {
  API_PREFIX,
  createNotesClient,
  createNoteInputSchema,
  listNotesQuerySchema,
  noteParamsSchema,
  updateNoteInputSchema,
  type ApiErrorBody,
  type ListNotesResponse,
} from "@notes/shared";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { AuthProvider } from "./auth";
import type { NotesRepo } from "./notes-repo";
import type { User, UsersRepo } from "./users-repo";

type AppEnv = { Variables: { user: User } };

function errorBody(code: string, message: string, issues?: unknown[]): ApiErrorBody {
  return { error: { code, message, ...(issues ? { issues } : {}) } };
}

/** Uniform 400 response for every zod validation failure. */
const validate = <T extends z.ZodType, Target extends "json" | "query" | "param">(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorBody("validation_error", "Request validation failed", result.error.issues),
        400,
      );
    }
  });

const idParam = validate("param", noteParamsSchema);

function notFound(c: Context) {
  return c.json(errorBody("not_found", "Note not found"), 404);
}

/**
 * In-process requests from the MCP server carry the already-authenticated user
 * under this Symbol in Hono's env. External requests can't set a Symbol key
 * (Bun/Node adapters pass their own env objects), so it can't be spoofed.
 */
const INTERNAL_USER = Symbol("notes.internalUser");

/** Public origin as the client saw it (Vercel/proxies set x-forwarded-*). */
function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export interface AppOptions {
  notes: NotesRepo;
  users: UsersRepo;
  auth: AuthProvider;
  corsOrigin?: string | string[];
  /** Makes the DB ready (e.g. migrations); awaited before each /api request. Should memoize. */
  ready?: () => Promise<unknown>;
}

export const MCP_PATH = "/mcp";
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

export function createApp({ notes, users, auth, corsOrigin = "*", ready }: AppOptions) {
  const api = new Hono<AppEnv>()
    .get("/me", (c) => c.json(c.get("user")))
    .get("/notes", validate("query", listNotesQuerySchema), async (c) => {
      const { q } = c.req.valid("query");
      const list = await notes.list(c.get("user").id, q || undefined);
      return c.json({ notes: list } satisfies ListNotesResponse);
    })
    .post("/notes", validate("json", createNoteInputSchema), async (c) => {
      const note = await notes.create(c.get("user").id, c.req.valid("json"));
      c.header("Location", `${API_PREFIX}/notes/${note.id}`);
      return c.json(note, 201);
    })
    .get("/notes/:id", idParam, async (c) => {
      const note = await notes.get(c.get("user").id, c.req.valid("param").id);
      return note ? c.json(note) : notFound(c);
    })
    .patch("/notes/:id", idParam, validate("json", updateNoteInputSchema), async (c) => {
      const note = await notes.update(c.get("user").id, c.req.valid("param").id, c.req.valid("json"));
      return note ? c.json(note) : notFound(c);
    })
    .delete("/notes/:id", idParam, async (c) => {
      const removed = await notes.remove(c.get("user").id, c.req.valid("param").id);
      return removed ? c.body(null, 204) : notFound(c);
    });

  const app = new Hono<AppEnv>();

  app.use(`${API_PREFIX}/*`, cors({ origin: corsOrigin }));
  app.use(`${API_PREFIX}/*`, bodyLimit({ maxSize: 1024 * 1024 }));
  app.get(`${API_PREFIX}/health`, (c) => c.json({ ok: true }));

  // Only the REST routes touch the DB; /mcp authenticates first, then reaches
  // them in-process, so unauthenticated MCP calls never wait on the database.
  if (ready) {
    app.use(`${API_PREFIX}/*`, async (_c, next) => {
      await ready();
      await next();
    });
  }

  // Every other /api route needs a signed-in user. Their local account is
  // created on the first authenticated request (the sign-in "callback").
  app.use(`${API_PREFIX}/*`, async (c, next) => {
    const internal = (c.env as Record<symbol, unknown> | undefined)?.[INTERNAL_USER] as User | undefined;
    if (internal) {
      c.set("user", internal);
      return next();
    }
    const clerkUserId = await auth.verifySession(c.req.raw);
    if (!clerkUserId) return c.json(errorBody("unauthorized", "Sign in required"), 401);
    c.set("user", await users.ensure(clerkUserId, () => auth.loadProfile(clerkUserId)));
    return next();
  });
  app.route(API_PREFIX, api);

  // --- Remote MCP server, protected by OAuth 2.1 with Clerk as the authorization server.

  const resourceMetadataUrl = (req: Request) => `${publicOrigin(req)}${RESOURCE_METADATA_PATH}${MCP_PATH}`;

  const mcpAuth: McpAuthenticator = async (req) => {
    const caller = await auth.verifyOAuth(req);
    if (!caller) {
      return {
        ok: false,
        response: Response.json(
          { error: "invalid_token", error_description: "Sign in with OAuth to use this MCP server" },
          {
            status: 401,
            headers: {
              "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(req)}"`,
            },
          },
        ),
      };
    }
    if (ready) await ready();
    const user = await users.ensure(caller.clerkUserId, () => auth.loadProfile(caller.clerkUserId));
    return {
      ok: true,
      authInfo: {
        token: "",
        clientId: caller.clientId,
        scopes: caller.scopes,
        extra: { user },
      },
    };
  };

  // MCP tools call this same REST API in-process through the shared typed
  // client, acting as the authenticated user.
  const mcp = createMcpFetchHandler({
    authenticate: mcpAuth,
    clientFor: (authInfo) => {
      const user = authInfo?.extra?.user as User;
      return createNotesClient({
        baseUrl: "http://in-process",
        fetch: (url, init) => Promise.resolve(app.request(url, init, { [INTERNAL_USER]: user })),
      });
    },
  });

  const mcpCors = cors({
    origin: corsOrigin,
    allowHeaders: ["Authorization", "Content-Type", "Accept", "Mcp-Protocol-Version", "Mcp-Session-Id"],
    exposeHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
  });
  app.use(MCP_PATH, mcpCors);
  app.all(MCP_PATH, (c) => mcp(c.req.raw));

  // RFC 9728 protected resource metadata: tells MCP clients to get tokens from Clerk.
  const resourceMetadata = (c: Context) =>
    c.json({
      resource: `${publicOrigin(c.req.raw)}${MCP_PATH}`,
      authorization_servers: [auth.issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["profile", "email"],
      resource_name: "Notes",
    });
  app.use("/.well-known/*", cors({ origin: "*" }));
  app.get(RESOURCE_METADATA_PATH, resourceMetadata);
  app.get(`${RESOURCE_METADATA_PATH}${MCP_PATH}`, resourceMetadata);

  // Older MCP clients look for authorization server metadata on the resource's
  // origin; mirror Clerk's document so they find the real endpoints.
  let authServerMetadata: Promise<unknown> | undefined;
  app.get("/.well-known/oauth-authorization-server", async (c) => {
    authServerMetadata ??= fetch(`${auth.issuer}/.well-known/oauth-authorization-server`)
      .then((r) => {
        if (!r.ok) throw new Error(`Clerk metadata ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        authServerMetadata = undefined;
        throw err;
      });
    return c.json((await authServerMetadata) as Record<string, unknown>);
  });

  app.notFound((c) =>
    c.json(errorBody("not_found", `No route for ${c.req.method} ${c.req.path}`), 404),
  );
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(errorBody("http_error", err.message), err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json(errorBody("internal_error", "Something went wrong"), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
