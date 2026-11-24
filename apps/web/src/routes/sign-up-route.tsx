import { SignUp } from "@clerk/react";
import { AuthPage } from "@/features/auth/auth-page";
import { Spinner } from "@/features/auth/full-page-loader";

export function SignUpRoute() {
  return (
    <AuthPage>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallback={<Spinner />} />
    </AuthPage>
  );
}
