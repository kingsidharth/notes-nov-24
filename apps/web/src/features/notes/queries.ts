import { useQuery } from "@tanstack/react-query";
import { notesApi } from "@/lib/api";
import { noteKeys } from "./note-keys";

export function useNotes(q: string) {
  return useQuery({
    queryKey: noteKeys.list(q),
    queryFn: () => notesApi.list({ q: q || undefined }),
    placeholderData: (previous) => previous,
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: ({ signal }) => notesApi.get(id, { signal }),
  });
}
