import { Suspense } from "react";
import AuthForm, { AuthFormFallback } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in — primer." };

export default function LoginPage() {
  // AuthForm reads ?next= via useSearchParams, which opts its tree into client
  // rendering; the boundary keeps the rest of the route statically prerendered.
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
