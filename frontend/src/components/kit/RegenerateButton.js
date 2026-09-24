"use client";

import { useEffect, useRef, useState } from "react";
import ErrorCallout from "@/components/ErrorCallout";
import { getJob, regenerateSection } from "@/lib/api";
import { regenerationPreview, regenerationReport } from "@/lib/kitDerive";

const POLL_MS = 1200;

/**
 * Regenerate one section, then say what actually happened to the user's work.
 *
 * The report is a client-side diff of the kit before and after, not a reading of the job.
 * It has to be: finishJob overwrites currentStep with 'done', so the server's own
 * "skipped — your edits were kept" / "replaced N generated item(s)" message is gone by the
 * time the job reports success. Diffing also lets us say WHY something survived.
 *
 * This component renders on six screens, so its resting state has to be quiet. The full
 * contract lives in the button's tooltip; the only thing that earns a visible line before
 * the press is work of the user's that the press would protect. When there is none —
 * the common case — the button stands alone.
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
  const protects = protectedLine(kit, section);

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        title={contractLine(kit, section)}
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

      {!running && protects && (
        <p className="mt-2 max-w-[320px] text-sm font-medium leading-[1.5] text-ink/50">
          {protects}
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

/**
 * The one thing worth saying before the press: what of yours survives it. Returns null
 * when the answer is "nothing of yours is at stake", which is most of the time.
 */
function protectedLine(kit, section) {
  const preview = regenerationPreview(kit, section);

  if (preview.single) {
    return preview.safe ? `You ${preview.reason} this — it will be kept as it is.` : null;
  }

  if (preview.kept === 0) return null;
  return `Keeps ${preview.kept} of yours.`;
}

/** The full contract, for the button's tooltip. */
function contractLine(kit, section) {
  const preview = regenerationPreview(kit, section);

  if (preview.single) {
    if (section === "schedule") {
      return "Rebuilds the days from the questions you have now.";
    }
    return preview.safe
      ? `You ${preview.reason} this, so it will be left exactly as it is.`
      : "Rewrites the brief from the pages we read.";
  }

  const noun = section === "flashcards" ? "card" : "question";
  const survivors = [
    preview.keptEdited ? `${preview.keptEdited} you edited` : null,
    preview.keptManual ? `${preview.keptManual} you wrote` : null,
    preview.keptPinned ? `${preview.keptPinned} pinned` : null,
  ].filter(Boolean);

  const replaces =
    preview.willReplace === 0
      ? "Nothing here would be replaced."
      : `Rewrites ${preview.willReplace} generated ${noun}${preview.willReplace === 1 ? "" : "s"}.`;

  return survivors.length
    ? `${replaces} Keeps ${preview.kept} — ${survivors.join(", ")}.`
    : replaces;
}

/** What actually happened, in one sentence. */
function Report({ report }) {
  const { section, skipped, kept, replaced, added } = report;
  const noun = section === "flashcards" ? "card" : "question";

  let text;
  if (skipped) {
    text = "Left alone — your version was kept.";
  } else if (section === "company_brief" || section === "schedule") {
    text = section === "schedule" ? "Days recomputed." : "Brief rewritten.";
  } else {
    const parts = [
      replaced === 0 ? "Nothing replaced" : `Replaced ${replaced}`,
      added > 0 ? `wrote ${added} new ${noun}${added === 1 ? "" : "s"}` : null,
      kept > 0 ? `kept ${kept} of yours` : null,
    ].filter(Boolean);
    text = `${parts.join(", ")}.`;
  }

  return (
    <p className="mt-3 max-w-[320px] rounded-xl bg-mint px-3.5 py-2.5 text-sm font-medium leading-[1.5] text-ink/70">
      {text}
    </p>
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
