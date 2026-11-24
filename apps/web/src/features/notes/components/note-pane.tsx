import { ApiError } from "@notes/shared";
import { FileQuestion, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { useNote } from "../queries";
import { EditorSkeleton } from "./editor-skeleton";
import { BackButton } from "./note-header";
import { NoteEditor } from "./note-editor";

/** Loads a note and renders the editor, or loading / not-found / error states. */
export function NotePane({ id }: { id: string }) {
  const { data: note, error, refetch, isRefetching } = useNote(id);

  if (note) return <NoteEditor key={note.id} note={note} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center px-2 md:hidden">
        <BackButton />
      </header>
      {error ? (
        isMissing(error) ? (
          <StatusMessage icon={<FileQuestion />} title="Note not found">
            <p>It may have been deleted, or the link is wrong.</p>
            <Button asChild variant="outline" size="lg">
              <Link to="/">Back to notes</Link>
            </Button>
          </StatusMessage>
        ) : (
          <StatusMessage icon={<TriangleAlert />} title="Couldn't load this note">
            <Button variant="outline" size="lg" onClick={() => void refetch()} disabled={isRefetching}>
              Try again
            </Button>
          </StatusMessage>
        )
      ) : (
        <div className="mx-auto w-full max-w-[880px] px-4 pt-6 md:px-12 md:pt-10 lg:px-20">
          <EditorSkeleton />
        </div>
      )}
    </div>
  );
}

/** 404, or 400 for an id that isn't even a valid UUID. */
function isMissing(error: Error) {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}
