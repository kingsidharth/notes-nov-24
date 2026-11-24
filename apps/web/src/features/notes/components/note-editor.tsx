import type { Note } from "@notes/shared";
import { lazy, Suspense, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { MarkdownEditorHandle } from "../editor/markdown-editor";
import { useDeleteNote } from "../mutations";
import { useNoteAutosave } from "../use-note-autosave";
import type { NoteLocationState } from "../use-create-and-open-note";
import { EditorSkeleton } from "./editor-skeleton";
import { NoteHeader } from "./note-header";
import { NoteTitleInput } from "./note-title-input";
import { SaveStatus } from "./save-status";

const MarkdownEditor = lazy(() => import("../editor/markdown-editor"));

/**
 * The open note. Title and body are local, uncontrolled-from-server state:
 * `note` seeds them on mount (the parent keys this by id) and later cache
 * updates only refresh metadata such as `pinned`.
 */
export function NoteEditor({ note }: { note: Note }) {
  const navigate = useNavigate();
  const location = useLocation();
  const focusTitle = (location.state as NoteLocationState | null)?.focusTitle === true;

  const [title, setTitle] = useState(note.title);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const autosave = useNoteAutosave(note);
  const deleteNote = useDeleteNote();

  const handleTitleChange = (next: string) => {
    setTitle(next);
    autosave.queue({ title: next });
  };

  const handleDelete = () => {
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        autosave.discard();
        void navigate("/", { replace: true });
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NoteHeader
        note={{ ...note, title }}
        onDelete={handleDelete}
        status={
          deleteNote.isError ? (
            <span role="alert" className="text-sm text-destructive">
              Couldn't delete note
            </span>
          ) : (
            <SaveStatus status={autosave.status} onRetry={autosave.retry} />
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <article className="mx-auto w-full max-w-[880px] px-4 pt-4 md:px-12 md:pt-8 lg:px-20">
          <NoteTitleInput
            value={title}
            onChange={handleTitleChange}
            onSubmit={() => editorRef.current?.focus()}
            autoFocus={focusTitle}
          />
          <Suspense fallback={<EditorSkeleton />}>
            <MarkdownEditor
              ref={editorRef}
              defaultValue={note.content}
              onChange={(content) => autosave.queue({ content })}
            />
          </Suspense>
        </article>
      </div>
    </div>
  );
}
