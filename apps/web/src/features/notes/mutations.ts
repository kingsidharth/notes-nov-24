import type { CreateNoteInput, Note, UpdateNoteInput } from "@notes/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notesApi } from "@/lib/api";
import {
  patchSummary,
  restoreLists,
  sortSummaries,
  toSummary,
  updateLists,
  type ListSnapshot,
} from "./cache";
import { noteKeys } from "./note-keys";

export interface UpdateNoteVariables {
  id: string;
  patch: UpdateNoteInput;
}

/**
 * Monotonic per-note write counter. A response only overwrites the cached note
 * if no newer write for that note has started since, so a slow older save can
 * never clobber newer local state.
 */
const latestWrite = new Map<string, number>();
let writeSeq = 0;

function beginWrite(id: string) {
  writeSeq += 1;
  latestWrite.set(id, writeSeq);
  return writeSeq;
}

function isLatestWrite(id: string, seq: number) {
  return latestWrite.get(id) === seq;
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput = {}) => notesApi.create(input),
    onSuccess: (note) => {
      queryClient.setQueryData(noteKeys.detail(note.id), note);
      // Show the new row in every cached list (searches included) so it's visible right away.
      updateLists(queryClient, (notes) => sortSummaries([toSummary(note), ...notes]));
    },
  });
}

interface UpdateContext {
  seq: number;
}

/** Writes a note (autosave or pin). Local state is applied optimistically. */
export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateNoteVariables) => notesApi.update(id, patch),
    onMutate: ({ id, patch }): UpdateContext => {
      queryClient.setQueryData<Note>(noteKeys.detail(id), (note) =>
        note ? { ...note, ...patch } : note,
      );
      return { seq: beginWrite(id) };
    },
    onSuccess: (note, { id }, context) => {
      if (!isLatestWrite(id, context.seq)) return;
      queryClient.setQueryData(noteKeys.detail(id), note);
      patchSummary(queryClient, id, toSummary(note));
    },
  });
}

interface PinContext {
  seq: number;
  previous: Note | undefined;
  lists: ListSnapshot;
}

export function useTogglePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      notesApi.update(id, { pinned }),
    onMutate: async ({ id, pinned }): Promise<PinContext> => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() });
      const previous = queryClient.getQueryData<Note>(noteKeys.detail(id));
      queryClient.setQueryData<Note>(noteKeys.detail(id), (note) =>
        note ? { ...note, pinned } : note,
      );
      const lists = patchSummary(queryClient, id, { pinned });
      return { seq: beginWrite(id), previous, lists };
    },
    onError: (_error, { id }, context) => {
      if (!context || !isLatestWrite(id, context.seq)) return;
      queryClient.setQueryData(noteKeys.detail(id), context.previous);
      restoreLists(queryClient, context.lists);
    },
    onSuccess: (note, { id }, context) => {
      if (!isLatestWrite(id, context.seq)) return;
      queryClient.setQueryData(noteKeys.detail(id), note);
      patchSummary(queryClient, id, toSummary(note));
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists() });
      return { lists: updateLists(queryClient, (notes) => notes.filter((n) => n.id !== id)) };
    },
    onError: (_error, _id, context) => {
      if (context) restoreLists(queryClient, context.lists);
    },
    onSuccess: (_data, id) => {
      latestWrite.delete(id);
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
    },
  });
}
