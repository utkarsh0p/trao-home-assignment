"use client";

import { useState } from "react";
import Link from "next/link";
import { exportKit } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { liveCoverage } from "@/lib/kitDerive";

export default function KitHeader({ kit }) {
  const coverage = liveCoverage(kit);
  const gaps = coverage.uncovered.length;

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

        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            {/* Titles are set once at generation and there is no rename endpoint, so
                this is text rather than an editable field. */}
            <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-[44px]">
              {kit.source?.role || kit.title || "Untitled kit"}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {kit.source?.company_url ? (
                <a
                  href={kit.source.company_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-lg text-[15px] font-semibold text-accent transition-colors
                             duration-200 hover:text-accent-dark focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {kit.source.company || kit.source.company_url} &nearr;
                </a>
              ) : (
                <span className="text-[15px] font-semibold text-ink/70">
                  {kit.source?.company}
                </span>
              )}
              <span className="text-sm font-medium text-ink/50">
                Updated {formatRelative(kit.updatedAt)}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-sky px-3 py-1 text-xs font-semibold text-ink/70">
                {kit.schedule?.days_available ?? 0}-day plan
              </span>
              <span className="inline-flex items-center rounded-full bg-ink/[0.04] px-3 py-1 text-xs font-semibold text-ink/60">
                {kit.questions?.length ?? 0} questions
              </span>
              <span className="inline-flex items-center rounded-full bg-ink/[0.04] px-3 py-1 text-xs font-semibold text-ink/60">
                {kit.flashcards?.length ?? 0} flashcards
              </span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-ink/70 ${
                  gaps === 0 ? "bg-mint" : "bg-sand"
                }`}
              >
                {gaps === 0
                  ? "Every requirement covered"
                  : `${gaps} requirement${gaps === 1 ? "" : "s"} uncovered`}
              </span>
            </div>
          </div>

          <ExportButton kit={kit} />
        </div>
      </div>
    </header>
  );
}

/**
 * /export sets no Content-Disposition and sits behind a cookie-authed route, so a plain
 * link would render JSON in a tab rather than download it. Fetch and save client-side.
 */
function ExportButton({ kit }) {
  const [state, setState] = useState("idle");

  async function download() {
    setState("working");
    try {
      const appendixA = await exportKit(kit._id);
      const blob = new Blob([JSON.stringify(appendixA, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slug(kit.title || kit.source?.role || "kit")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setState("done");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={state === "working"}
      className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-ink/20
                 bg-white/60 px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-200
                 hover:border-ink/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none
                 disabled:opacity-50"
    >
      {state === "working"
        ? "Exporting…"
        : state === "done"
          ? "Downloaded"
          : state === "failed"
            ? "Export failed"
            : "Export JSON"}
    </button>
  );
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kit";
}
