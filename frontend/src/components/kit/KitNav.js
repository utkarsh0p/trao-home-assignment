"use client";

// The five things the brief says the user reads: "a company brief, a role breakdown, a
// categorised question bank, flashcards and a study schedule". The flashcards tab is
// named Practice after brief §7 ("Practice Mode"): the cards are the material, practice
// is the mode, and browsing the deck to edit it lives inside that mode.
// The `flashcards` id is the server's section contract and does not change.
export const TABS = [
  { id: "company", label: "Company" },
  { id: "role", label: "Role" },
  { id: "questions", label: "Questions" },
  { id: "flashcards", label: "Practice" },
  { id: "schedule", label: "Schedule" },
];

const BASE =
  "shrink-0 cursor-pointer text-sm font-semibold transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

/**
 * One list, two shapes. The sidebar (lg and up) and the horizontal strip (below lg) show
 * the same five sections and the same stale marker, so they share a component rather than
 * drifting apart. The accent simply moves from the bottom edge to the left edge.
 */
export default function KitNav({ tab, setTab, scheduleStale, orientation = "horizontal" }) {
  const vertical = orientation === "vertical";

  return (
    <div
      role="tablist"
      aria-label="Kit sections"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={vertical ? "flex flex-col gap-0.5" : "-mb-px flex gap-1 overflow-x-auto"}
    >
      {TABS.map((item) => {
        const active = tab === item.id;

        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => setTab(item.id)}
            className={
              vertical
                ? `${BASE} flex w-full items-center justify-between gap-2 rounded-r-lg border-l-2 px-4 py-2.5 ${
                    active
                      ? "border-accent bg-ink/[0.04] text-ink"
                      : "border-transparent text-ink/60 hover:bg-ink/5 hover:text-ink"
                  }`
                : `${BASE} border-b-2 px-4 py-3 ${
                    active ? "border-accent text-ink" : "border-transparent text-ink/60 hover:text-ink"
                  }`
            }
          >
            {item.label}
            {item.id === "schedule" && scheduleStale && (
              <span
                aria-label="needs rebuilding"
                className={`inline-block size-1.5 rounded-full bg-accent align-middle ${
                  vertical ? "" : "ml-2"
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
