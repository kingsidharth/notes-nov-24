import { Check, CloudAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveStatus as Status } from "../use-note-autosave";

export function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === "error") {
    return (
      <span role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
        <CloudAlert className="size-4 shrink-0" />
        <span className="truncate">Couldn't save</span>
        <span aria-hidden>—</span>
        <Button variant="link" size="sm" onClick={onRetry} className="h-10 px-1 text-destructive">
          Retry
        </Button>
      </span>
    );
  }

  return (
    <span aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {status === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-3.5" /> Saved
        </>
      )}
    </span>
  );
}
