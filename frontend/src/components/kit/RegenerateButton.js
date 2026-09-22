"use client";

import { useEffect, useRef, useState } from "react";
import ErrorCallout from "@/components/ErrorCallout";
import { getJob, regenerateSection } from "@/lib/api";
import { CATEGORY_LABELS, regenerationReport } from "@/lib/kitDerive";

const POLL_MS = 1200;

/**
 * Regenerate one section, then say what actually happened to the user's work.
 *
 * The report is a client-side diff of the kit before and after, not a reading of the job.
 * It has to be: finishJob overwrites currentStep with 'done', so the server's own
 * "skipped — your edits were kept" / "replaced N generated item(s)" message is gone by the
 * time the job reports success. Diffing also lets us say WHY something survived.
 */
export default function RegenerateButton({ kit, section, refetch, onRegenerated, label }) {
  const [state, setState] = useState({ phase: "idle", report: null, error: null });
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function run() {
    const before = kit;
    setState({ phase: "running", report: null, error: null });

    try {
      const job = await regenerateSection(kit._id, section);
      const finished = await pollUntilDone(job.id, timer);

      if (finished.status === "failed") {
        setState({ phase: "idle", report: null, error: finished.error });
        return;
      }

      const after = await refetch();
      setState({
        phase: "done",
        report: regenerationReport(before, after, section),
        error: null,
      });
      onRegenerated?.(section);
    } catch (error) {
      setState({ phase: "idle", report: null, error });
    }
  }

  const running = state.phase === "running";

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink/20
                   bg-white/60 px-4 py-2 text-sm font-semibold text-ink transition-colors
                   duration-200 hover:border-ink/40 hover:bg-surface focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                   disabled:pointer-events-none disabled:opacity-50"
      >
        {running ? (
          <>
            <span className="size-3 animate-pulse rounded-full bg-accent" />
            Regenerating…
          </>
        ) : (
          <>Regenerate {label}</>
        )}
      </button>

      {running && (
        <p className="mt-3 text-sm font-medium text-ink/50">
          {section === "schedule"
            ? "Recomputing the plan — this is arithmetic, not a model call."
            : "Writing fresh content. Anything you edited, wrote or pinned is left alone."}
        </p>
      )}

      {state.error && (
        <div className="mt-4">
          <ErrorCallout title="That regeneration didn't finish." error={state.error} />
        </div>
      )}

      {state.report && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }) {
  const { section, skipped, kept, keptBreakdown, replaced, added, keptReason } = report;
  const noun = section === "flashcards" ? "flashcard" : "question";

  if (skipped) {
    return (
      <div className="mt-4 rounded-2xl bg-mint p-4">
        <p className="text-[15px] leading-[1.6] text-ink/70">
          <b className="font-semibold text-ink">Left alone.</b> You had {keptReason ?? "changed"}{" "}
          this section, so it was kept exactly as it was rather than being overwritten.
        </p>
      </div>
    );
  }

  if (section === "company_brief" || section === "schedule") {
    return (
      <div className="mt-4 rounded-2xl bg-mint p-4">
        <p className="text-[15px] leading-[1.6] text-ink/70">
          <b className="font-semibold text-ink">Rewritten.</b>{" "}
          {section === "schedule"
            ? "The days were recomputed from the questions you have now."
            : "The brief was rewritten from the pages we read."}
        </p>
      </div>
    );
  }

  const survivors = [
    keptBreakdown?.edited ? `${keptBreakdown.edited} you edited` : null,
    keptBreakdown?.manual ? `${keptBreakdown.manual} you wrote` : null,
    keptBreakdown?.pinned ? `${keptBreakdown.pinned} pinned` : null,
  ].filter(Boolean);

  return (
    <div className="mt-4 rounded-2xl bg-mint p-4">
      <p className="text-[15px] leading-[1.6] text-ink/70">
        <b className="font-semibold text-ink">
          {replaced === 0
            ? `Nothing was replaced.`
            : `Replaced ${replaced} generated ${noun}${replaced === 1 ? "" : "s"}.`}
        </b>{" "}
        {added > 0 && `Wrote ${added} new ${noun}${added === 1 ? "" : "s"}. `}
        {kept > 0
          ? `Kept ${kept} — ${survivors.join(", ")}.`
          : "There was nothing of yours to keep."}
      </p>
    </div>
  );
}

function pollUntilDone(jobId, timer) {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId);
        if (job.status === "succeeded" || job.status === "failed") return resolve(job);
        timer.current = window.setTimeout(tick, POLL_MS);
      } catch (error) {
        reject(error);
      }
    };
    tick();
  });
}

export { CATEGORY_LABELS };
