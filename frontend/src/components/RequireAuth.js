"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

// The JWT lives in an httpOnly cookie set by the API on its own origin, so it is never
// sent to the Next.js server — middleware and server components cannot see it. A client
// guard is the only option here, not a shortcut around a server-side one.

export default function RequireAuth({ children }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "authenticated") return children;

  // Covers both "still asking" and the frame between deciding and the redirect landing.
  // Never a flash of protected content.
  return (
    <section className="bg-paper px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="mx-auto h-8 w-40 animate-pulse rounded-lg bg-ink/[0.04]" />
        <span className="sr-only">
          {status === "loading" ? "Checking your session" : "Redirecting to sign in"}
        </span>
      </div>
    </section>
  );
}
