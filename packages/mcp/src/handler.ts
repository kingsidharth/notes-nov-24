import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NotesClient } from "@notes/shared";
import { bearerTokenAuth, type McpAuthenticator } from "./auth";
import { createNotesMcpServer } from "./server";

export interface McpFetchHandlerOptions {
  client: NotesClient;
  /** Static bearer secret. Undefined = open endpoint (logs a warning once). */
  authToken?: string;
  /** Custom auth (e.g. OAuth 2.1 token validation). Takes precedence over `authToken`. */
  authenticate?: McpAuthenticator;
}

export type McpFetchHandler = (req: Request) => Promise<Response>;

const ALLOW = "POST";

function methodNotAllowed(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed: this stateless server only accepts POST" },
      id: null,
    },
    { status: 405, headers: { Allow: ALLOW } },
  );
}

/**
 * Remote MCP over Streamable HTTP, stateless: every request gets a fresh
 * server + transport, no session ids, JSON (not SSE) responses. Pure
 * fetch-API in/out, so it mounts in Hono, Bun.serve, or a serverless function.
 */
export function createMcpFetchHandler(options: McpFetchHandlerOptions): McpFetchHandler {
  const { client } = options;
  let authenticate = options.authenticate;
  if (!authenticate && options.authToken) authenticate = bearerTokenAuth(options.authToken);
  if (!authenticate) {
    console.warn("[@notes/mcp] No authToken configured: the MCP endpoint is open to anyone who can reach it.");
  }

  return async (req) => {
    const auth = authenticate ? await authenticate(req) : { ok: true as const };
    if (!auth.ok) return auth.response;

    if (req.method !== "POST") return methodNotAllowed();

    const server = createNotesMcpServer(client);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      // In JSON mode this resolves only once every response is ready, so the
      // body is fully buffered before we tear the pair down.
      return await transport.handleRequest(req, { authInfo: auth.authInfo });
    } catch (err) {
      console.error("[@notes/mcp] request failed", err);
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null },
        { status: 500 },
      );
    } finally {
      await server.close().catch(() => {});
    }
  };
}
