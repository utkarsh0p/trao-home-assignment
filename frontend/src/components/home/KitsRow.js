"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import KitCard from "@/components/home/KitCard";
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
            <SkeletonRow />
          ) : error ? (
            <ErrorCallout error={error} />
          ) : status !== "authenticated" ? (
            <SignedOutCard />
          ) : kits.length === 0 ? (
            <EmptyCard />
          ) : (
            <KitGrid kits={kits} />
          )}
        </div>
      </div>
    </section>
  );
}

function KitGrid({ kits }) {
  return (
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
  );
}

function SkeletonRow() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex animate-pulse flex-col gap-4 rounded-2xl border border-ink/10 bg-surface p-5 sm:p-6"
        >
          <div className="h-3 w-24 rounded-full bg-ink/[0.04]" />
          <div className="h-6 w-full rounded-lg bg-ink/[0.04]" />
          <div className="h-6 w-2/3 rounded-lg bg-ink/[0.04]" />
          <div className="mt-2 flex gap-2">
            <div className="h-6 w-24 rounded-full bg-ink/[0.04]" />
            <div className="h-6 w-32 rounded-full bg-ink/[0.04]" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading your kits</span>
    </div>
  );
}

function CentredCard({ title, children, actions }) {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col items-center rounded-2xl border border-ink/10 bg-surface p-8 text-center shadow-lifted sm:p-10">
      <h3 className="text-2xl font-semibold tracking-[-0.035em] text-ink">{title}</h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-ink/60 sm:text-base">{children}</p>
      <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{actions}</div>
    </div>
  );
}

function SignedOutCard() {
  return (
    <CentredCard
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
      Sign in to see the kits you have already built, or start a new one now &mdash; a kit
      takes about a minute and a half to research and write.
    </CentredCard>
  );
}

function EmptyCard() {
  return (
    <CentredCard
      title="No kits yet."
      actions={
        <Button href="/new" variant="primary" className="w-full sm:w-auto">
          Create your first kit
        </Button>
      }
    >
      Paste a job description and a company website and primer. will do the reading. You
      will need the posting text itself &mdash; we never fetch it from a job board.
    </CentredCard>
  );
}

/* The API speaks { error: { code, message } }. Show the human half prominently and
   keep the code available, because it is the same vocabulary the batch output uses. */
function ErrorCallout({ error }) {
  return (
    <div className="mx-auto max-w-[680px] rounded-2xl bg-sand p-5 sm:p-6">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">
        We couldn&rsquo;t load your kits.
      </h3>
      <p className="mt-2 text-[15px] leading-[1.6] text-ink/70">{error.message}</p>
      <p className="mt-3 font-mono text-sm text-ink/50">{error.code}</p>
    </div>
  );
}
