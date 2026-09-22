import Link from "next/link";
import { formatRelative } from "@/lib/format";

// Built strictly from what GET /api/kits actually projects: title, source.company,
// source.role, schedule.days_available, coverage, updatedAt. Question and flashcard
// counts are not in that response, and fetching every kit to show a number would be
// a poor trade — so the card doesn't claim them.

export default function KitCard({ kit }) {
  const gaps = kit.coverage?.uncovered_requirement_ids?.length ?? 0;
  const days = kit.schedule?.days_available;
  const role = kit.source?.role || kit.title || "Untitled kit";
  const company = kit.source?.company;

  return (
    <Link
      href={`/kits/${kit._id}`}
      className="group flex cursor-pointer flex-col rounded-2xl border border-ink/10 bg-surface
                 p-5 shadow-lifted transition-[transform,box-shadow,border-color] duration-300
                 hover:-translate-y-1 hover:border-ink/20 hover:shadow-float
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                 focus-visible:ring-offset-2 sm:p-6"
    >
      {company && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
          {company}
        </span>
      )}

      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink">
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
    </Link>
  );
}
