import { UserButton } from "@clerk/react";
import { Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useCreateAndOpenNote } from "../use-create-and-open-note";
import { flushPendingSaves } from "../use-note-autosave";
import { NoteList } from "./note-list";

const SEARCH_DEBOUNCE_MS = 250;

/** 40px touch target around Clerk's avatar; utilities win over Clerk's `components` layer. */
const userButtonAppearance = {
  elements: {
    userButtonTrigger: "size-10 justify-center rounded-full",
    userButtonAvatarBox: "size-7",
  },
};

export function NotesSidebar({ activeId }: { activeId: string | undefined }) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const { create, isPending } = useCreateAndOpenNote();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4 md:px-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium">Notes</h1>
        <ThemeToggle />
        <Button size="lg" onClick={create} disabled={isPending} className="px-3">
          {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          New note
        </Button>
        {/* Opening the menu sends pending edits while the session can still authorize them. */}
        <div
          className="flex size-10 shrink-0 items-center justify-center"
          onPointerDownCapture={flushPendingSaves}
          onKeyDownCapture={flushPendingSaves}
        >
          <UserButton appearance={userButtonAppearance} />
        </div>
      </header>

      <div className="px-4 pb-2 md:px-3">
        <label className="relative block">
          <span className="sr-only">Search notes</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes"
            className="h-10 bg-background pl-9"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-1.5">
        <NoteList q={q} activeId={activeId} onCreate={create} />
      </nav>
    </div>
  );
}
