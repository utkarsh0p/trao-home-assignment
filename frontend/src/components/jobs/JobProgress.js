"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import RequireAuth from "@/components/RequireAuth";
import { displayUrl } from "@/lib/format";
import { PHASES, labelFor, phaseOf, phaseOfNode } from "@/lib/jobSteps";

import { useJob } from "@/lib/useJob";

const TYPICAL_SECONDS = 40;

export default function JobProgress({ jobId }) {
  return (
    <RequireAuth>
      <Progress jobId={jobId} />
    </RequireAuth>
  );
}

function Progress({ jobId }) {
  const router = useRouter();
  const { job, error } = useJob(jobId);
  const elapsed = useElapsed(job?.createdAt);

  // The three research branches run in parallel and the coverage loop re-enters
  // check_coverage, so step names do not arrive in order. Hold a high-water mark, so the
  // list never appears to go backwards. Adjusted during render — React's documented way
  // to derive state from a changing input, and it settles before anything paints.
  const [current, setCurrent] = useState(-1);
  const phase = phaseOf(job?.currentStep);
  if (phase > current) setCurrent(phase);

  // Every row knows which node reported it, so each phase shows its own work rather
  // than the research phase carrying the whole list.
  const byPhase = useMemo(() => {
    const buckets = PHASES.map(() => []);
    for (const entry of job?.trail ?? []) {
      buckets[phaseOfNode(entry.node)]?.push(entry);
    }
    return buckets;
  }, [job?.trail]);

  useEffect(() => {
    if (job?.status === "succeeded" && job.kitId) {
      router.replace(`/kits/${job.kitId}`);
    }
  }, [job?.status, job?.kitId, router]);

  if (error?.code === "JOB_NOT_FOUND") {
    return (
      <Shell title="No such run.">
        <ErrorCallout
          title="We couldn't find that run."
          error={{ code: "JOB_NOT_FOUND", message: "It may belong to another account, or the link may be wrong." }}
        >
          <Button href="/new" variant="secondary">
            Start a new kit
          </Button>
        </ErrorCallout>
      </Shell>
    );
  }

  if (job?.status === "failed") {
    return (
      <Shell title="That run didn't finish.">
        <ErrorCallout title={headlineFor(job.error?.code)} error={job.error}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/new" variant="primary">
              Try again
            </Button>
            <Button href="/mykits" variant="secondary">
              Back to my kits
            </Button>
          </div>
        </ErrorCallout>
        <p className="mt-5 text-sm font-medium leading-relaxed text-ink/50">
          Your inputs are still filled in on the new kit form.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="Building your kit">
      <p className="text-[15px] leading-[1.55] text-ink/60 sm:text-xl">
        Researching the company and writing questions against every requirement we found.
        Usually about {TYPICAL_SECONDS} seconds.
      </p>

      <ol className="mt-10 flex flex-col gap-1">
        {PHASES.map((item, index) => (
          <Phase
            key={item.id}
            phase={item}
            state={index < current ? "done" : index === current ? "active" : "pending"}
            step={index === current ? job?.currentStep : null}
            // A finished phase keeps its rows, so a user who looked away can still see
            // what was actually read, searched and written.
            trail={index <= current ? byPhase[index] : null}
          />
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/10 pt-6">
        <span className="text-sm font-medium tabular-nums text-ink/50">
          {elapsed}s elapsed
        </span>
        {elapsed > TYPICAL_SECONDS * 2 && (
          <span className="text-sm font-medium text-ink/50">
            Taking longer than usual &mdash; a slow company site or a rate-limited model
            call will do that. It is still going.
          </span>
        )}
      </div>

      <p className="mt-6 text-sm font-medium leading-relaxed text-ink/50">
        You can close this tab. The run keeps going on the server, and the kit will be
        waiting in{" "}
        <a
          href="/mykits"
          className="rounded-lg font-semibold text-accent underline underline-offset-4
                     transition-colors duration-200 hover:text-accent-dark
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                     focus-visible:ring-offset-2"
        >
          My kits
        </a>
        .
      </p>
    </Shell>
  );
}

function Phase({ phase, state, step, trail }) {
  return (
    <li className="flex gap-4 py-3">
      <span className="mt-0.5 shrink-0">
        {state === "done" ? (
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-mint">
            <svg viewBox="0 0 12 12" className="size-3 text-ink" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.2l2.4 2.4 4.6-5" />
            </svg>
          </span>
        ) : state === "active" ? (
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-accent">
            <span className="size-2 animate-pulse rounded-full bg-white" />
          </span>
        ) : (
          <span className="inline-flex size-6 items-center justify-center rounded-full border border-ink/10 bg-ink/[0.04]" />
        )}
      </span>

      <div className="min-w-0">
        <p
          className={`text-lg font-semibold tracking-[-0.02em] ${
            state === "pending" ? "text-ink/35" : "text-ink"
          }`}
        >
          {phase.title}
        </p>
        <p className={`mt-1 text-[15px] leading-[1.6] ${state === "pending" ? "text-ink/35" : "text-ink/60"}`}>
          {state === "active" && step ? labelFor(step) : phase.blurb}
        </p>

        {trail?.length > 0 && <Trail entries={trail} />}
      </div>
    </li>
  );
}

/**
 * What the run is doing, as it does it.
 *
 * Every row is reported by the node doing the work (src/lib/activity.js), which is the
 * only way a row can read "searching" while the search is still running — graph state
 * cannot say that, because a node's writes do not land until it returns.
 *
 * A URL row puts the address in the mono column and what the page is on the right; a row
 * with no URL — a search, a category being written, a check — puts its name on the left
 * and its outcome on the right. Three columns either way, and no pills.
 */
function Trail({ entries }) {
  return (
    <ul aria-label="What this step is doing" className="mt-3 flex flex-col gap-1">
      {entries.map((entry) => {
        const mark = MARKS[entry.status] ?? MARKS.queued;
        const faded = entry.status === "queued";

        return (
          <li key={entry.id} className="flex items-baseline gap-2.5 text-sm leading-[1.5]">
            <span aria-hidden="true" className={`w-3 shrink-0 font-semibold ${mark.tone}`}>
              {mark.glyph === null ? (
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent align-middle" />
              ) : (
                mark.glyph
              )}
            </span>
            <span className="sr-only">{mark.said}</span>

            <span
              className={`min-w-0 flex-1 truncate ${entry.url ? "font-mono text-[13px]" : ""} ${
                faded ? "text-ink/35" : "text-ink/70"
              }`}
            >
              {entry.url ? displayUrl(entry.url) : entry.label}
            </span>

            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink/40">
              {entry.url ? entry.label : entry.detail}
            </span>

            {entry.url && entry.detail && entry.status !== "ok" && (
              <span className="shrink-0 text-[11px] font-medium text-ink/50">{entry.detail}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sand-free, and colour-free but for the one accent: a skipped step is information, not
 * a failure (style.md §2). `skipped` and `failed` are different glyphs because they are
 * different facts — "we chose not to" versus "we tried and could not".
 */
const MARKS = {
  ok: { glyph: "\u2713", tone: "text-ink/60", said: "done" },
  running: { glyph: null, tone: "text-accent", said: "in progress" },
  failed: { glyph: "\u00d7", tone: "text-ink/40", said: "failed" },
  skipped: { glyph: "\u2013", tone: "text-ink/30", said: "skipped" },
  queued: { glyph: "\u00b7", tone: "text-ink/25", said: "queued" },
};

function Shell({ title, children }) {
  return (
    <section className="bg-paper px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto w-full max-w-[680px]">
        <h1
          aria-live="polite"
          className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl"
        >
          {title}
        </h1>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

function headlineFor(code) {
  switch (code) {
    case "COMPANY_UNREACHABLE":
      return "We couldn't reach that company's site.";
    case "INVALID_URL":
      return "That company address wasn't usable.";
    case "URL_BLOCKED":
      return "That address can't be fetched.";
    case "RUN_INTERRUPTED":
      return "The server restarted mid-run.";
    case "LLM_NOT_CONFIGURED":
      return "The model isn't configured on the server.";
    default:
      return "Something went wrong during the run.";
  }
}

function useElapsed(startedAt) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const timer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.round((Date.now() - start) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return seconds;
}

