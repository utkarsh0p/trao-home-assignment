"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { exportKit } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { liveCoverage } from "@/lib/kitDerive";

export default function KitHeader({ kit }) {
  const coverage = liveCoverage(kit);
  const gaps = coverage.uncovered.length;
  // Prefer the days actually planned. `days_available` is what was asked for at intake
  // and the two can disagree, which had the header claiming "5-day plan" over a 3-day list.
  const days = kit.schedule?.days?.length || kit.schedule?.days_available || 0;
  const updated = formatRelative(kit.updatedAt);

  return (
    <header className="border-b border-ink/10 bg-surface px-5 pb-8 pt-10 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[1320px]">
        <Link
          href="/mykits"
          className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-ink/50
                     transition-colors duration-200 hover:text-ink focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          &larr; My kits
        </Link>

        <div className="mt-4 flex flex-col items-start gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            {/* Titles are set once at generation and there is no rename endpoint, so
                this is text rather than an editable field. */}
            <h1 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.04em] text-ink min-[390px]:text-[32px] sm:text-[44px] sm:leading-[1.05] sm:tracking-[-0.045em]">
              {kit.source?.role || kit.title || "Untitled kit"}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {kit.source?.company_url ? (
                <a
                  href={kit.source.company_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="max-w-full break-words rounded-lg text-[15px] font-semibold text-accent
                             transition-colors duration-200 hover:text-accent-dark
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                             focus-visible:ring-offset-2"
                >
                  {kit.source.company || kit.source.company_url} &#8599;
                </a>
              ) : (
                <span className="text-[15px] font-semibold text-ink/70">
                  {kit.source?.company}
                </span>
              )}
              {/* formatRelative returns "" for an unparseable date, so the timestamp
                  is appended only when there is one. */}
              <span className="text-sm font-medium text-ink/50">
                {days}-day plan &middot; {count(kit.questions?.length ?? 0, "question")}{" "}
                &middot; {count(kit.flashcards?.length ?? 0, "card")}
                {updated && ` · updated ${updated}`}
              </span>
            </div>

            {/* Four pills — one of them a whole sentence — was the loudest thing under
                the title and said nothing the user had asked. The counts are meta, so they
                read as meta; the only one that earns a pill is a gap, because a gap is
                something to act on. A fully covered kit says nothing at all. */}
            {(coverage.total === 0 || gaps > 0) && (
              <div className="mt-4">
                <span className="inline-flex items-center rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink/70">
                  {coverage.total === 0
                    ? "No requirements found in this posting"
                    : `${gaps} requirement${gaps === 1 ? "" : "s"} uncovered`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function count(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * /export sets no Content-Disposition and sits behind a cookie-authed route, so a plain
 * link would render JSON in a tab rather than download it. Fetch and save client-side.
 *
 * Nothing in the brief asks for an in-app export — §9's requirement is the CLI. It lives
 * here because style.md §8 puts ids, origins and pipeline counters in "the kit JSON, the
 * export and the README — not the screen"; this is the door to that artefact, so it is
 * deliberately quiet rather than a headline control.
 */
export function ExportButton({ kit, className = "" }) {
  const [state, setState] = useState("idle");
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reset = (ms) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), ms);
  };

  async function download() {
    setState("working");
    try {
      const appendixA = await exportKit(kit._id);
      const blob = new Blob([JSON.stringify(appendixA, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      // Same preference order as the <h1>, so the file is named after what the page calls
      // this kit rather than the other way round.
      anchor.download = `${slug(kit.source?.role || kit.title || "kit")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoking in the same tick as the click loses the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);

      setState("done");
      reset(2000);
    } catch {
      setState("failed");
      reset(4000);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={download}
        disabled={state === "working"}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm
                   font-medium text-ink/50 transition-colors duration-200 hover:bg-ink/5
                   hover:text-ink focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-accent focus-visible:ring-offset-2
                   disabled:pointer-events-none disabled:opacity-50"
      >
        {state === "working" ? "Exporting…" : state === "done" ? "Downloaded" : "Export JSON"}
      </button>
      {/* The old version swallowed the error entirely and self-cleared, so a failure was
          indistinguishable from never having clicked. */}
      <p aria-live="polite" className={state === "failed" ? "mt-1 px-2 text-xs font-medium text-ink/70" : "sr-only"}>
        {state === "failed" ? "Export failed — try again." : state === "done" ? "Downloaded." : ""}
      </p>
    </div>
  );
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kit";
}
