"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import ErrorCallout from "@/components/ErrorCallout";
import KitCard from "@/components/KitCard";
import { KitCardSkeletonGrid } from "@/components/KitCardSkeleton";
import { listKits } from "@/lib/api";
import { useSession } from "@/lib/session";

const PREVIEW_COUNT = 3;

// Four states, all of them designed rather than defaulted: still asking, signed out,
// signed in with nothing yet, and something went wrong. style.md §1.5 — an honest
// state gets a real screen, not a red box or a skeleton pretending content is coming.

export default function KitsRow() {
  const { status } = useSession();
  // One piece of state, not two: a load either yields kits or an error, never both.
  const [result, setResult] = useState({ kits: null, error: null });

  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    listKits(controller.signal)
      .then((kits) => setResult({ kits, error: null }))
      .catch((cause) => {
        if (cause?.name === "AbortError") return;
        setResult({ kits: null, error: cause });
      });

    return () => controller.abort();
  }, [status]);

  const { kits, error } = result;
  const loading = status === "loading" || (status === "authenticated" && !kits && !error);

  return (
    <section id="kits" className="scroll-mt-24 bg-paper px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
            Your kits
          </span>
          <h2 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-ink sm:text-[38px] lg:text-5xl">
            Pick up where you left off.
          </h2>
        </div>

        <div className="mt-10 sm:mt-14">
          {loading ? (
            <KitCardSkeletonGrid />
          ) : error ? (
            <div className="mx-auto max-w-[680px]">
              <ErrorCallout title="We couldn't load your kits." error={error} />
            </div>
          ) : status !== "authenticated" ? (
            <EmptyState
              title="Your kits will live here."
              actions={
                <>
                  <Button href="/new" variant="primary" className="w-full sm:w-auto">
                    Create a prep kit
                  </Button>
                  <Button href="/login" variant="secondary" className="w-full sm:w-auto">
                    Sign in
                  </Button>
                </>
              }
            >
              Sign in to see the kits you have already built, or start a new one now &mdash;
              a kit takes under a minute to research and write.
            </EmptyState>
          ) : kits.length === 0 ? (
            <EmptyState
              title="No kits yet."
              actions={
                <Button href="/new" variant="primary" className="w-full sm:w-auto">
                  Create your first kit
                </Button>
              }
            >
              Paste a job description and a company website and primer. will do the
              reading. You will need the posting text itself &mdash; we never fetch it
              from a job board.
            </EmptyState>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                {kits.slice(0, PREVIEW_COUNT).map((kit) => (
                  <KitCard key={kit._id} kit={kit} />
                ))}
              </div>

              {kits.length > PREVIEW_COUNT && (
                <div className="mt-8 flex justify-center">
                  <Link
                    href="/mykits"
                    className="rounded-lg text-[15px] font-semibold text-accent transition-colors
                               duration-200 hover:text-accent-dark focus-visible:outline-none
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4"
                  >
                    See all {kits.length} kits &rarr;
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
