import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useCreateNote } from "./mutations";

/** Router state telling the note pane to focus the title on arrival. */
export interface NoteLocationState {
  focusTitle?: boolean;
}

export function useCreateAndOpenNote() {
  const navigate = useNavigate();
  const { mutate, isPending } = useCreateNote();

  const create = useCallback(() => {
    if (isPending) return;
    mutate(
      {},
      {
        onSuccess: (note) =>
          navigate(`/notes/${note.id}`, { state: { focusTitle: true } satisfies NoteLocationState }),
      },
    );
  }, [isPending, mutate, navigate]);

  return { create, isPending };
}
