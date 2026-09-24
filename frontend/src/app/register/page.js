import { Suspense } from "react";
import AuthForm, { AuthFormFallback } from "@/components/auth/AuthForm";

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
