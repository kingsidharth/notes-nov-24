import type { NoteSummary } from "@notes/shared";
import { Pin } from "lucide-react";
import { Link } from "react-router";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

interface NoteListItemProps {
  note: NoteSummary;
  active: boolean;
  now: number;
}

export function NoteListItem({ note, active, now }: NoteListItemProps) {
  return (
    <li>
      <Link
        to={`/notes/${note.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block rounded-lg px-3 py-2.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              !note.title && "text-muted-foreground",
            )}
          >
            {note.title || "Untitled"}
          </span>
          {note.pinned && (
            <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" />
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
          {note.excerpt || "No content"}
        </p>
        <time dateTime={note.updatedAt} className="mt-1 block text-xs text-muted-foreground/80">
          {formatRelativeTime(note.updatedAt, now)}
        </time>
      </Link>
    </li>
  );
}
