import type { Note } from "@notes/shared";
import { ArrowLeft, Pin, PinOff } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useTogglePin } from "../mutations";
import { DeleteNoteButton } from "./delete-note-button";

interface NoteHeaderProps {
  note: Note;
  status: ReactNode;
  onDelete: () => void;
}

export function NoteHeader({ note, status, onDelete }: NoteHeaderProps) {
  const togglePin = useTogglePin();
  const pinLabel = note.pinned ? "Unpin note" : "Pin note";

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2 md:border-b-0 md:px-4">
      <BackButton />
      <div className="min-w-0 flex-1 px-2">{status}</div>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={pinLabel}
        aria-pressed={note.pinned}
        title={pinLabel}
        onClick={() => togglePin.mutate({ id: note.id, pinned: !note.pinned })}
      >
        {note.pinned ? <PinOff /> : <Pin />}
      </Button>
      <DeleteNoteButton title={note.title} onConfirm={onDelete} />
    </header>
  );
}

/** Mobile only: the list is a separate screen below md. */
export function BackButton() {
  return (
    <Button variant="ghost" size="icon-lg" asChild className="md:hidden">
      <Link to="/" aria-label="Back to notes">
        <ArrowLeft />
      </Link>
    </Button>
  );
}
