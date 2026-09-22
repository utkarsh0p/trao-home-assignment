"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import RequireAuth from "@/components/RequireAuth";
import { logout } from "@/lib/api";
import { useSession } from "@/lib/session";

// Deliberately thin. Brief §3.1 puts email verification, password reset and role
// hierarchies explicitly out of scope and unscored — an account here is a way to own
// your kits, nothing more.

export default function ProfilePanel() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}

function Profile() {
  const { user, setUser } = useSession();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      await logout();
      setUser(null);
      router.replace("/");
    } catch (cause) {
      setError(cause);
      setPending(false);
    }
  }

  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto w-full max-w-[560px]">
        <h1 className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
          Your account
        </h1>

        <div className="mt-8 rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-8">
          <div className="flex items-center gap-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-semibold uppercase text-white">
              {user?.email?.[0] ?? "?"}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
                Signed in as
              </p>
              <p className="truncate text-lg font-semibold tracking-[-0.02em] text-ink">
                {user?.email}
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-ink/10 pt-6">
            <Button variant="secondary" onClick={signOut} disabled={pending}>
              {pending ? "Signing out…" : "Sign out"}
            </Button>
          </div>

          {error && (
            <div className="mt-6">
              <ErrorCallout title="Couldn't sign you out." error={error} />
            </div>
          )}
        </div>

        <p className="mt-6 text-sm font-medium leading-relaxed text-ink/50">
          Your session lasts seven days. Signing out clears it everywhere on this browser.
        </p>
      </div>
    </section>
  );
}
