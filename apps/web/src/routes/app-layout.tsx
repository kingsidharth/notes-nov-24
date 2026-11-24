import { Outlet, useMatch } from "react-router";
import { NotesSidebar } from "@/features/notes/components/notes-sidebar";
import { useNewNoteShortcut } from "@/features/notes/use-new-note-shortcut";
import { cn } from "@/lib/utils";

/**
 * md+: sidebar and pane side by side. Below md one screen at a time: the list
 * on "/", the pane everywhere else (open note, not-found).
 */
export function AppLayout() {
  const atIndex = useMatch({ path: "/", end: true }) !== null;
  const activeId = useMatch("/notes/:id")?.params.id;
  useNewNoteShortcut();

  return (
    <div className="flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <aside
        className={cn(
          "min-w-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:w-[300px] md:shrink-0 md:border-r md:border-sidebar-border",
          atIndex ? "flex w-full" : "hidden",
        )}
      >
        <NotesSidebar activeId={activeId} />
      </aside>
      <main className={cn("min-w-0 flex-1 flex-col", atIndex ? "hidden md:flex" : "flex")}>
        <Outlet />
      </main>
    </div>
  );
}
