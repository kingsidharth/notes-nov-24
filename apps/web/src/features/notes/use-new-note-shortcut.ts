import { useEffect } from "react";
import { useCreateAndOpenNote } from "./use-create-and-open-note";

/** Mod+Alt+N creates a note. Matches `code` because Alt changes `key` on macOS. */
export function useNewNoteShortcut() {
  const { create } = useCreateAndOpenNote();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === "KeyN") {
        event.preventDefault();
        create();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [create]);
}
