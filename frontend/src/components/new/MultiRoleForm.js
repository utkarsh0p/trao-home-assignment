"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import { createJob, getJob } from "@/lib/api";
import { labelFor } from "@/lib/jobSteps";
import { CaseFileError, MAX_CASES, SAMPLE_FILE, parseCases } from "@/lib/parseCases";

/**
 * The multi-role path: upload a file of description-and-company pairs and build a kit
 * for each (brief §2).
 *
 * Client-side fan-out, no bulk endpoint (.claude/decisions.md). `POST /api/jobs` already
 * takes one case, dedupes it, and runs it in the background; a batch endpoint would be a
 * second way to start the same work. The POSTs go out one at a time so a burst cannot
 * trip `generationLimiter`, but we do NOT wait for each generation to finish before
 * sending the next — every job is created up front, which is what makes closing the tab
 * safe. The runs themselves are throttled server-side by the LLM client's own
 * concurrency limiter, so ten at once does not mean ten concurrent model calls.
 */

const POLL_MS = 1500;
const TERMINAL = new Set(["succeeded", "failed", "blocked", "skipped"]);

export default function MultiRoleForm() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState(null);
  const [truncated, setTruncated] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | ready | running | done
  const inputRef = useRef(null);

  const patch = (key, changes) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );

  /* ------------------------------------------------------------------ the file */

  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setFileName(file.name);

    try {
      const { cases, truncated: dropped } = parseCases(await file.text());
      setRows(
        cases.map((entry) => ({
          ...entry,
          state: entry.error ? "blocked" : "waiting",
          jobId: null,
          kitId: null,
          step: null,
          failure: null,
        })),
      );
      setTruncated(dropped);
      setPhase("ready");
    } catch (cause) {
      const message =
        cause instanceof CaseFileError ? cause.message : "That file could not be read.";
      setFileError({ code: "BAD_CASE_FILE", message });
      setRows([]);
      setTruncated(0);
      setPhase("idle");
    } finally {
      // Clearing the input means picking the same file twice in a row still fires
      // onChange — otherwise a corrected file with an unchanged name does nothing.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    setFileError(null);
    setTruncated(0);
    setPhase("idle");
  }

  /* -------------------------------------------------------------- the fan-out */

  async function startAll() {
    setPhase("running");

    // Snapshot: `rows` is captured per render, and we are about to mutate it in a loop.
    const runnable = rows.filter((row) => !row.error);

    for (let i = 0; i < runnable.length; i += 1) {
      const row = runnable[i];
      patch(row.key, { state: "starting" });

      try {
        const { job } = await createJob({
          jd: row.jd,
          companyUrl: row.companyUrl,
          days: row.days,
        });

        // Dedupe can hand back a run that already finished — treat it as done rather
        // than polling a terminal job forever.
        patch(row.key, {
          jobId: job.id,
          kitId: job.kitId ?? null,
          state: job.kitId ? "succeeded" : job.status,
          step: job.currentStep,
        });
      } catch (cause) {
        patch(row.key, {
          state: "failed",
          failure: { code: cause.code, message: cause.message },
        });

        // The hourly budget is gone, so every remaining POST would fail the same way.
        // Stop, and say plainly which rows never started rather than firing five more
        // requests to collect five more identical errors.
        if (cause.code === "TOO_MANY_GENERATIONS") {
          for (const later of runnable.slice(i + 1)) {
            patch(later.key, {
              state: "skipped",
              failure: {
                code: "NOT_STARTED",
                message: "Not started — the hourly generation limit was reached.",
              },
            });
          }
          break;
        }
      }
    }

    setPhase("done");
  }

  /* --------------------------------------------------------------- the polling */

  // One timer for the whole batch rather than a poller per row: the rows that are still
  // running are re-read on each pass, so finished ones drop out on their own.
  useEffect(() => {
    const live = rows.filter((row) => row.jobId && !TERMINAL.has(row.state));
    if (live.length === 0) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      await Promise.all(
        live.map(async (row) => {
          try {
            const job = await getJob(row.jobId, controller.signal);
            patch(row.key, {
              state: job.status,
              step: job.currentStep,
              kitId: job.kitId ?? null,
              failure: job.error ?? null,
            });
          } catch (cause) {
            // A blip mid-batch must not strand the other nine. Leave the row as it is
            // and let the next pass pick it up.
            if (cause?.name !== "AbortError" && cause?.code !== "NETWORK_UNREACHABLE") {
              patch(row.key, {
                state: "failed",
                failure: { code: cause.code, message: cause.message },
              });
            }
          }
        }),
      );
    }, POLL_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [rows]);

  /* ------------------------------------------------------------------ rendering */

  const runnable = rows.filter((row) => !row.error).length;
  const finished = rows.filter((row) => TERMINAL.has(row.state)).length;
  const built = rows.filter((row) => row.state === "succeeded").length;
  const settled = phase !== "idle" && phase !== "ready" && finished === rows.length;
  // The fan-out loop is over in well under a second; the runs it started are not. Both
  // count as busy, or "Start over" clears a list of kits that are still being built.
  const busy = phase === "running" || rows.some((row) => row.jobId && !TERMINAL.has(row.state));

  if (phase === "idle") {
    return (
      <div className="rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-8">
        {fileError && (
          <div className="mb-6">
            <ErrorCallout title="That file didn't parse." error={fileError} />
          </div>
        )}

        <FilePicker inputRef={inputRef} onFile={onFile} />

        <div className="mt-6 border-t border-ink/10 pt-6">
          <p className="text-sm font-medium text-ink/60">
            One JSON array, up to {MAX_CASES} roles &mdash; the same shape{" "}
            <code className="rounded bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[13px]">
              npm run evaluate
            </code>{" "}
            reads, so a file written for one works in the other.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-paper p-4 font-mono text-[13px] leading-[1.6] text-ink/70">
            {SAMPLE_FILE}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
          {fileName || "Uploaded file"}
        </h2>
        <p aria-live="polite" className="text-sm font-medium tabular-nums text-ink/50">
          {phase === "ready"
            ? `${runnable} of ${rows.length} ready to build`
            : `${finished} of ${rows.length} finished`}
        </p>
      </div>

      {truncated > 0 && (
        <p className="mt-3 rounded-xl bg-sand px-4 py-3 text-[15px] leading-[1.6] text-ink/70">
          Only the first {MAX_CASES} are shown &mdash; {truncated} more{" "}
          {truncated === 1 ? "was" : "were"} left out. Split the file, or use{" "}
          <code className="font-mono text-[13px]">npm run evaluate</code> for a bigger run.
        </p>
      )}

      <ul className="mt-6 flex flex-col divide-y divide-ink/[0.07] border-y border-ink/[0.07]">
        {rows.map((row) => (
          <CaseRow key={row.key} row={row} />
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        {phase === "ready" && (
          <Button variant="primary" onClick={startAll} disabled={runnable === 0}>
            {runnable === 1 ? "Build 1 kit" : `Build ${runnable} kits`}
          </Button>
        )}

        {settled && built > 0 && (
          <Button href="/mykits" variant="primary">
            {built === 1 ? "See the kit" : `See all ${built} kits`}
          </Button>
        )}

        <Button variant="secondary" onClick={reset} disabled={busy}>
          {phase === "ready" ? "Choose another file" : "Start over"}
        </Button>
      </div>

      {runnable === 0 && phase === "ready" && (
        <p className="mt-4 text-sm font-medium leading-relaxed text-ink/50">
          Nothing on this file is runnable yet &mdash; fix the rows flagged above and
          upload it again.
        </p>
      )}

      {busy && (
        <p className="mt-4 text-sm font-medium leading-relaxed text-ink/50">
          Kits build in parallel on the server, and the model is throttled so they do not
          trip a free-tier limit &mdash; so the last one lands well after the first. You
          can close this tab; every finished kit will be waiting in{" "}
          <Link
            href="/mykits"
            className="rounded-lg font-semibold text-accent underline underline-offset-4
                       transition-colors duration-200 hover:text-accent-dark
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            My kits
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sub-components */

function FilePicker({ inputRef, onFile }) {
  return (
    <div>
      <label htmlFor="cases" className="block text-sm font-medium text-ink/60">
        A file of roles
      </label>
      {/* A bare file input cannot be styled; the label is the control, and keeping the
          input focusable (not hidden) is what keeps it reachable by keyboard. */}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border
                     border-ink/20 bg-white/60 px-5 py-3 text-[15px] font-semibold text-ink
                     transition-[background-color,border-color,transform] duration-200
                     hover:-translate-y-0.5 hover:border-ink/40 hover:bg-surface
                     focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2"
        >
          <input
            ref={inputRef}
            id="cases"
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="sr-only"
          />
          Choose a JSON file
        </label>
      </div>
    </div>
  );
}

function CaseRow({ row }) {
  const title = row.jd.trim().split("\n")[0]?.slice(0, 70) || row.id;

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-1 truncate text-sm font-medium text-ink/50">
          {row.companyUrl || "no company URL"}
          {Number.isInteger(row.days) && ` · ${row.days} ${row.days === 1 ? "day" : "days"}`}
        </p>
        {(row.error || row.failure) && (
          <p className="mt-1.5 text-sm font-medium text-ink/70">
            {row.error ?? row.failure.message}
          </p>
        )}
      </div>

      <div className="shrink-0">
        <StatusChip row={row} />
      </div>
    </li>
  );
}

function StatusChip({ row }) {
  if (row.state === "succeeded" && row.kitId) {
    return (
      <Link
        href={`/kits/${row.kitId}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs
                   font-semibold text-ink transition-colors duration-200 hover:bg-mint/70
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                   focus-visible:ring-offset-2"
      >
        Open kit
      </Link>
    );
  }

  const { tint, label } = PRESENTATION[row.state] ?? PRESENTATION.waiting;

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tint}`}>
      {row.state === "running" && row.step ? labelFor(row.step) : label}
    </span>
  );
}

// Sand for anything that needs attention, mint for done, sky for in flight — style.md §2.
// Red is reserved for a field that will not submit, which this never is.
const PRESENTATION = {
  blocked: { tint: "bg-sand text-ink/70", label: "Can't run" },
  waiting: { tint: "bg-ink/[0.05] text-ink/60", label: "Waiting" },
  starting: { tint: "bg-sky text-ink/70", label: "Starting" },
  queued: { tint: "bg-sky text-ink/70", label: "Queued" },
  running: { tint: "bg-sky text-ink/70", label: "Building" },
  succeeded: { tint: "bg-mint text-ink/70", label: "Built" },
  failed: { tint: "bg-sand text-ink/70", label: "Failed" },
  skipped: { tint: "bg-sand text-ink/70", label: "Not started" },
};
