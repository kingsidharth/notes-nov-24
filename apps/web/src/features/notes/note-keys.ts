/** Query-key factory: every notes cache entry hangs off `noteKeys.all`. */
export const noteKeys = {
  all: ["notes"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (q: string) => [...noteKeys.lists(), { q }] as const,
  details: () => [...noteKeys.all, "detail"] as const,
  detail: (id: string) => [...noteKeys.details(), id] as const,
};
