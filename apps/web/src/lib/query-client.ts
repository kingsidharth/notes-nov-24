import { ApiError } from "@notes/shared";
import { QueryClient } from "@tanstack/react-query";

/** 4xx responses won't succeed on retry; network blips and 5xx might. */
function shouldRetry(failureCount: number, error: Error) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // The open note is edited locally; focus refetches would only add churn.
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
    mutations: { retry: false },
  },
});
