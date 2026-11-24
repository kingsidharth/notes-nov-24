import { ClerkProvider } from "@clerk/react";
import { shadcn } from "@clerk/ui/themes";
import { Outlet, useNavigate } from "react-router";
import { AuthBridge } from "@/features/auth/auth-bridge";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to apps/web/.env.local (Clerk dashboard → API keys) and restart Vite.",
  );
}

/**
 * Root route: ClerkProvider lives inside the data router so Clerk's own links
 * and redirects go through react-router instead of full page reloads.
 * Colours come from the app's shadcn tokens, so `.dark` on <html> themes Clerk too.
 */
export function RootLayout() {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
      appearance={{ theme: shadcn }}
    >
      <AuthBridge />
      <Outlet />
    </ClerkProvider>
  );
}
