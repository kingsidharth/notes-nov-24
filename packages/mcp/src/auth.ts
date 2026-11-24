import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Pluggable request authenticator. Static bearer tokens today; an OAuth 2.1
 * resource-server check (JWT/introspection + RFC 9728 metadata pointer in
 * WWW-Authenticate) can implement the same shape later.
 */
export type McpAuthenticator = (req: Request) => Promise<McpAuthResult>;
export type McpAuthResult = { ok: true; authInfo?: AuthInfo } | { ok: false; response: Response };

export const AUTH_REALM = "notes";

export function unauthorized(error?: "invalid_token", description = "Missing bearer token"): Response {
  const challenge = `Bearer realm="${AUTH_REALM}"` + (error ? `, error="${error}"` : "");
  return Response.json(
    { error: error ?? "unauthorized", error_description: description },
    { status: 401, headers: { "WWW-Authenticate": challenge } },
  );
}

const encoder = new TextEncoder();

/**
 * Constant-time string equality. Hashing first gives equal-length inputs, so
 * neither the content nor the length of the secret leaks through timing.
 * Uses WebCrypto only, so it runs on Bun, Node and edge runtimes alike.
 */
export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** Requires `Authorization: Bearer <token>` matching the configured secret. */
export function bearerTokenAuth(token: string): McpAuthenticator {
  if (!token) throw new Error("bearerTokenAuth: token must be a non-empty string");
  return async (req) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
    if (!match) return { ok: false, response: unauthorized() };
    const presented = match[1]!.trim();
    if (!(await timingSafeEqualStrings(presented, token))) {
      return { ok: false, response: unauthorized("invalid_token", "Invalid bearer token") };
    }
    return { ok: true, authInfo: { token: presented, clientId: "static-bearer", scopes: [] } };
  };
}
