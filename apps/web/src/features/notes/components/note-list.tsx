import { FileText, Plus, SearchX, TriangleAlert } from "lucide-react";
import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/lib/use-now";
import { useNotes } from "../queries";
import { NoteListItem } from "./note-list-item";

interface NoteListProps {
  q: string;
  activeId: string | undefined;
  onCreate: () => void;
}

export function NoteList({ q, activeId, onCreate }: NoteListProps) {
  const { data: notes, isPending, isError, refetch, isRefetching } = useNotes(q);
  const now = useNow();

  if (isPending) return <NoteListSkeleton />;

  if (isError && !notes) {
    return (
      <StatusMessage icon={<TriangleAlert />} title="Couldn't load notes">
        <Button variant="outline" size="lg" onClick={() => void refetch()} disabled={isRefetching}>
          Try again
        </Button>
      </StatusMessage>
    );
  }

  if (notes.length === 0) {
    return q ? (
      <StatusMessage icon={<SearchX />} title="No matching notes">
        <p>Nothing matches “{q}”.</p>
      </StatusMessage>
    ) : (
      <StatusMessage icon={<FileText />} title="No notes yet — create one">
        <Button size="lg" onClick={onCreate}>
          <Plus /> New note
        </Button>
      </StatusMessage>
    );
  }

  return (
    <ul className="space-y-0.5" aria-label="Notes">
      {notes.map((note) => (
        <NoteListItem key={note.id} note={note} active={note.id === activeId} now={now} />
      ))}
    </ul>
  );
}

function NoteListSkeleton() {
  return (
    <div className="space-y-1" aria-busy="true" aria-label="Loading notes">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2 px-3 py-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
