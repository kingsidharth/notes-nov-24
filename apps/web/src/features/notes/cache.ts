import { toExcerpt, type Note, type NoteSummary } from "@notes/shared";
import type { QueryClient } from "@tanstack/react-query";
import { noteKeys } from "./note-keys";

export type ListSnapshot = [readonly unknown[], NoteSummary[] | undefined][];

export function toSummary({ content, ...rest }: Note): NoteSummary {
  return { ...rest, excerpt: toExcerpt(content) };
}

/** Mirrors the server's ORDER BY pinned DESC, updated_at DESC. */
export function sortSummaries(notes: NoteSummary[]): NoteSummary[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Applies `update` to every cached list (all search terms) and returns the previous state. */
export function updateLists(
  queryClient: QueryClient,
  update: (notes: NoteSummary[]) => NoteSummary[],
): ListSnapshot {
  const snapshot = queryClient.getQueriesData<NoteSummary[]>({ queryKey: noteKeys.lists() });
  queryClient.setQueriesData<NoteSummary[]>({ queryKey: noteKeys.lists() }, (notes) =>
    notes ? update(notes) : notes,
  );
  return snapshot;
}

export function restoreLists(queryClient: QueryClient, snapshot: ListSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

/** Merges fields into the matching row of every cached list, then re-sorts. */
export function patchSummary(
  queryClient: QueryClient,
  id: string,
  patch: Partial<NoteSummary>,
): ListSnapshot {
  return updateLists(queryClient, (notes) =>
    sortSummaries(notes.map((n) => (n.id === id ? { ...n, ...patch } : n))),
  );
}
