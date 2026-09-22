"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import RequireAuth from "@/components/RequireAuth";
import { PHASES, labelFor, phaseOf } from "@/lib/jobSteps";
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

function Phase({ phase, state, step }) {
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
      </div>
    </li>
  );
}

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
