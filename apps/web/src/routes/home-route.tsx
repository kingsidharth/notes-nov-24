import { NotebookPen, Plus } from "lucide-react";
import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { useCreateAndOpenNote } from "@/features/notes/use-create-and-open-note";

/** Desktop-only empty pane (on mobile "/" shows the list instead). */
export function HomeRoute() {
  const { create, isPending } = useCreateAndOpenNote();
  return (
    <StatusMessage icon={<NotebookPen />} title="Pick a note, or start a new one">
      <p>Markdown renders as you type. Changes save automatically.</p>
      <Button size="lg" onClick={create} disabled={isPending}>
        <Plus /> New note
      </Button>
      <p className="text-xs">
        Shortcut: <kbd className="rounded border px-1 font-mono">⌘/Ctrl ⌥/Alt N</kbd>
      </p>
    </StatusMessage>
  );
}
