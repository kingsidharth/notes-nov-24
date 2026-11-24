import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { setAuthTokenGetter } from "@/lib/api";

/**
 * Connects Clerk to the non-React parts of the app:
 * - the API client asks Clerk for a fresh session token on every request;
 * - when the signed-in user changes (sign-out, sign-in, account switch) the
 *   query cache is dropped, so one user's notes never render for another.
 */
export function AuthBridge() {
  const { isLoaded, userId, getToken } = useAuth();
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    const current = userId ?? null;
    if (lastUserId.current !== undefined && lastUserId.current !== current) {
      // Also runs on the next sign-in, which drops anything a request still in
      // flight at sign-out wrote back into the cache.
      void queryClient.cancelQueries();
      queryClient.clear();
    }
    lastUserId.current = current;
  }, [isLoaded, userId, queryClient]);

  return null;
}
