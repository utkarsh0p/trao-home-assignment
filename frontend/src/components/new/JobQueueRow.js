"use client";

import Link from "next/link";
import { labelFor } from "@/lib/jobSteps";
import { useJob } from "@/lib/useJob";

// One row of the batch queue, polling its own job. Rows that arrived already finished
// (the dedupe case) skip polling entirely.

export default function JobQueueRow({ entry }) {
  const { job, error } = useJob(entry.kitId ? null : entry.jobId);

  const kitId = entry.kitId ?? job?.kitId ?? null;
  const status = entry.kitId ? "succeeded" : (job?.status ?? "queued");

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-ink">{entry.label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-ink/50">
          {error
            ? error.message
            : status === "failed"
              ? (job?.error?.message ?? "Failed.")
              : status === "succeeded"
                ? "Ready"
                : labelFor(job?.currentStep)}
        </p>
      </div>

      {status === "succeeded" && kitId ? (
        <Link
          href={`/kits/${kitId}`}
          className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-ink/70
                     transition-opacity duration-200 hover:opacity-80 focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Open kit &rarr;
        </Link>
      ) : status === "failed" ? (
        <span className="shrink-0 rounded-full bg-sand px-3 py-1 font-mono text-xs font-semibold text-ink/70">
          {job?.error?.code ?? "FAILED"}
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-ink/[0.04] px-3 py-1 text-xs font-semibold text-ink/60">
          Running
        </span>
      )}
    </li>
  );
}
