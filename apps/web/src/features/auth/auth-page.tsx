import { Show, useAuth } from "@clerk/react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { FullPageLoader } from "./full-page-loader";
import { afterAuthPath } from "./redirects";

/**
 * Centered shell for Clerk's <SignIn/> and <SignUp/>. Signed-in visitors are
 * sent on to their `redirect_url` (or home). Scrolls instead of clipping when
 * a step is taller than the viewport, and clears notches and home indicators.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth();
  const { search } = useLocation();
  if (!isLoaded) return <FullPageLoader />;
  return (
    <Show when="signed-out" fallback={<Navigate to={afterAuthPath(search)} replace />}>
      <div className="flex min-h-dvh flex-col items-center px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="my-auto flex w-full flex-col items-center gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-xl font-semibold tracking-tight">Notes</span>
          </div>
          {children}
        </div>
      </div>
    </Show>
  );
}
