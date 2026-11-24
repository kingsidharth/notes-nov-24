import type { Note } from "@notes/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdateNote } from "./mutations";

export const AUTOSAVE_DELAY_MS = 600;

/** Window event that makes every mounted autosave send its pending edits now. */
const FLUSH_EVENT = "notes:flush-autosave";

/** Sends pending edits right away, e.g. before the session can end on sign-out. */
export function flushPendingSaves() {
  window.dispatchEvent(new Event(FLUSH_EVENT));
}

type Draft = Partial<Pick<Note, "title" | "content">>;
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Fields in `draft` that differ from what the server last confirmed, or null. */
function changedFields(draft: Draft, saved: Draft): Draft | null {
  const patch: Draft = {};
  if (draft.title !== undefined && draft.title !== saved.title) patch.title = draft.title;
  if (draft.content !== undefined && draft.content !== saved.content) patch.content = draft.content;
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Debounced, serialized autosave for one note.
 *
 * - Edits accumulate in `pending`; at most one PATCH is in flight per note, and
 *   anything typed meanwhile is sent right after it, so the latest edit wins.
 * - Only fields that differ from the last confirmed save are sent.
 * - Pending edits are flushed on unmount (note switch), tab hide and unload;
 *   the API client marks small writes `keepalive` so they survive the page.
 */
export function useNoteAutosave(note: Note) {
  const { id } = note;
  const { mutateAsync } = useUpdateNote();
  const [status, setStatus] = useState<SaveStatus>("idle");

  const saved = useRef<Draft>({ title: note.title, content: note.content });
  const pending = useRef<Draft>({});
  const inFlight = useRef(false);
  const discarded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancelTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const flush = useCallback(
    async (force = false): Promise<void> => {
      cancelTimer();
      if (discarded.current || (inFlight.current && !force)) return;

      const patch = changedFields(pending.current, saved.current);
      pending.current = {};
      if (!patch) {
        if (!inFlight.current) setStatus((s) => (s === "saving" ? "saved" : s));
        return;
      }

      inFlight.current = true;
      setStatus("saving");
      try {
        await mutateAsync({ id, patch });
        Object.assign(saved.current, patch);
        inFlight.current = false;
        // Edits made during the request: send now unless their debounce is still running.
        if (changedFields(pending.current, saved.current)) {
          if (timer.current === undefined) return flush();
          return;
        }
        setStatus("saved");
      } catch {
        inFlight.current = false;
        // Keep the failed fields queued underneath anything typed since.
        pending.current = { ...patch, ...pending.current };
        setStatus("error");
      }
    },
    [id, mutateAsync, cancelTimer],
  );

  const queue = useCallback(
    (change: Draft) => {
      if (discarded.current) return;
      Object.assign(pending.current, change);
      setStatus("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  /** Drops pending edits for good, e.g. right before the note is deleted. */
  const discard = useCallback(() => {
    discarded.current = true;
    cancelTimer();
    pending.current = {};
  }, [cancelTimer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    // The page is going away, so don't queue behind an in-flight save.
    const onBeforeUnload = () => void flush(true);
    const onFlushRequest = () => void flush();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener(FLUSH_EVENT, onFlushRequest);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener(FLUSH_EVENT, onFlushRequest);
      void flush();
    };
  }, [flush]);

  const retry = useCallback(() => void flush(), [flush]);

  return { status, queue, retry, discard };
}
