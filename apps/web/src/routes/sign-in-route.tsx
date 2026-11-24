import { SignIn } from "@clerk/react";
import { AuthPage } from "@/features/auth/auth-page";
import { Spinner } from "@/features/auth/full-page-loader";

export function SignInRoute() {
  return (
    <AuthPage>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallback={<Spinner />} />
    </AuthPage>
  );
}
