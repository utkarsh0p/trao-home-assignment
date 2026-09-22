"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRelative } from "@/lib/format";

// Built strictly from what GET /api/kits projects: title, source.company, source.role,
// schedule.days_available, coverage, updatedAt. Question and flashcard counts are not in
// that response, and fetching every kit to show a number would be a poor trade — so the
// card doesn't claim them.
//
// The whole card is the link, but a delete button cannot legally nest inside an <a>. So
// the card is a div with a stretched link underneath and the button above it in z-order.

export default function KitCard({ kit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const gaps = kit.coverage?.uncovered_requirement_ids?.length ?? 0;
  const days = kit.schedule?.days_available;
  const role = kit.source?.role || kit.title || "Untitled kit";
  const company = kit.source?.company;

  return (
    <div
      className="relative flex flex-col rounded-2xl border border-ink/10 bg-surface p-5
                 shadow-lifted transition-[transform,box-shadow,border-color] duration-300
                 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2
                 hover:-translate-y-1 hover:border-ink/20 hover:shadow-float sm:p-6"
    >
      <Link
        href={`/kits/${kit._id}`}
        aria-label={`${role}${company ? ` at ${company}` : ""}`}
        className="absolute inset-0 z-10 rounded-2xl focus:outline-none"
      />

      {onDelete && (
        <div className="absolute right-4 top-4 z-20">
          {confirming ? (
            <div className="flex items-center gap-1.5 rounded-full bg-surface p-1 shadow-lifted">
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete(kit);
                  } finally {
                    setDeleting(false);
                    setConfirming(false);
                  }
                }}
                className="cursor-pointer rounded-full bg-[#DC2626] px-3 py-1 text-xs font-semibold
                           text-white transition-opacity duration-200 hover:opacity-90
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-accent focus-visible:ring-offset-1
                           disabled:pointer-events-none disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-ink/60
                           transition-colors duration-200 hover:bg-ink/5 hover:text-ink
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-accent focus-visible:ring-offset-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${role}`}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg
                         text-ink/35 transition-colors duration-200 hover:bg-ink/5 hover:text-ink
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                         focus-visible:ring-offset-1"
            >
              <TrashGlyph />
            </button>
          )}
        </div>
      )}

      {company && (
        <span className="pr-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
          {company}
        </span>
      )}

      <h3 className="mt-2 pr-10 text-2xl font-semibold tracking-[-0.035em] text-ink">
        <span className="line-clamp-2">{role}</span>
      </h3>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {Number.isFinite(days) && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky px-3 py-1 text-xs font-semibold text-ink/70">
            {days}-day plan
          </span>
        )}
        {gaps === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-ink/70">
            Every must-have covered
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink/70">
            {gaps} uncovered
          </span>
        )}
      </div>

      <p className="mt-auto pt-5 text-sm font-medium leading-relaxed text-ink/50">
        Updated {formatRelative(kit.updatedAt)}
      </p>
    </div>
  );
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
    </svg>
  );
}
