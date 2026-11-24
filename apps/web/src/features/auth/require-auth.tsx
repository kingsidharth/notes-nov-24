import { useAuth } from "@clerk/react";
import { Fragment } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { FullPageLoader } from "./full-page-loader";
import { signInPathFor } from "./redirects";

/**
 * Layout route guarding the notes UI: a loader until Clerk is ready, sign-in
 * (remembering where the user was headed) when signed out. Keyed by user so
 * an account switch remounts the tree instead of reusing the last user's state.
 */
export function RequireAuth() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const location = useLocation();

  if (!isLoaded) return <FullPageLoader />;
  if (!isSignedIn) return <Navigate to={signInPathFor(location)} replace />;
  return (
    <Fragment key={userId}>
      <Outlet />
    </Fragment>
  );
}
