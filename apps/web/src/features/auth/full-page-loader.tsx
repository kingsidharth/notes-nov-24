import { ClerkFailed, ClerkLoading } from "@clerk/react";
import { Loader2, TriangleAlert } from "lucide-react";
import { StatusMessage } from "@/components/status-message";

export function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center p-8" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Shown until Clerk knows whether anyone is signed in, so no protected UI flashes. */
export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ClerkLoading>
        <Spinner />
      </ClerkLoading>
      <ClerkFailed>
        <StatusMessage icon={<TriangleAlert />} title="Couldn't reach the sign-in service">
          <p>Check your connection, then reload the page.</p>
        </StatusMessage>
      </ClerkFailed>
    </div>
  );
}
