import { createClerkClient } from "@clerk/backend";
import type { UserProfile } from "./users-repo";

/** Identity checks the app needs; Clerk in production, a fake in tests. */
export interface AuthProvider {
  /** OAuth authorization server for MCP clients (Clerk's Frontend API URL). */
  issuer: string;
  /** Clerk user id behind a browser session token, or null. */
  verifySession(req: Request): Promise<string | null>;
  /** Caller behind an OAuth access token issued to an MCP client, or null. */
  verifyOAuth(req: Request): Promise<{ clerkUserId: string; clientId: string; scopes: string[] } | null>;
  /** Profile used when creating the local account. */
  loadProfile(clerkUserId: string): Promise<UserProfile>;
}

/** `pk_test_<base64("<frontend-api-host>$")>` → `https://<frontend-api-host>` */
export function frontendApiFromPublishableKey(publishableKey: string): string {
  const encoded = publishableKey.split("_").slice(2).join("_");
  const host = atob(encoded).replace(/\$$/, "");
  if (!host.includes(".")) throw new Error("Invalid Clerk publishable key");
  return `https://${host}`;
}

export interface ClerkAuthOptions {
  secretKey: string;
  publishableKey: string;
  /** Allowed `azp` origins for session tokens (e.g. https://notes.example.com). */
  authorizedParties?: string[];
}

export function createClerkAuth({ secretKey, publishableKey, authorizedParties }: ClerkAuthOptions): AuthProvider {
  const clerk = createClerkClient({ secretKey, publishableKey });

  return {
    issuer: frontendApiFromPublishableKey(publishableKey),

    async verifySession(req) {
      const state = await clerk.authenticateRequest(req, {
        acceptsToken: "session_token",
        authorizedParties: authorizedParties?.length ? authorizedParties : undefined,
      });
      return state.isAuthenticated ? state.toAuth().userId : null;
    },

    async verifyOAuth(req) {
      const state = await clerk.authenticateRequest(req, { acceptsToken: "oauth_token" });
      if (!state.isAuthenticated) return null;
      const auth = state.toAuth();
      return { clerkUserId: auth.userId, clientId: auth.clientId ?? "", scopes: auth.scopes ?? [] };
    },

    async loadProfile(clerkUserId) {
      const user = await clerk.users.getUser(clerkUserId);
      const name = user.fullName?.trim() || user.username || null;
      return { email: user.primaryEmailAddress?.emailAddress ?? null, name };
    },
  };
}

/** Reads Clerk settings from env; throws a clear error when they're missing. */
export function clerkAuthFromEnv(env: Record<string, string | undefined>): AuthProvider {
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.CLERK_PUBLISHABLE_KEY ?? env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error("CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY must be set");
  }
  return createClerkAuth({
    secretKey,
    publishableKey,
    authorizedParties: env.CLERK_AUTHORIZED_PARTIES?.split(",").map((s) => s.trim()).filter(Boolean),
  });
}
