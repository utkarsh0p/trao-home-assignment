/**
 * Whether a regeneration would keep or replace this thing.
 *
 * Used on the company brief only — a single item, where the state is genuinely worth
 * knowing at a glance. Questions and flashcards deliberately do NOT wear this: the brief
 * asks us to represent generated / edited / pinned state and explain it in the README
 * (§6), not to label every row. For those, the contract is stated once, on the
 * Regenerate button, where the decision is actually made.
 */

const LABELS = {
  edited: { text: "Edited", title: "You changed this, so a regeneration will keep it." },
  manual: { text: "Yours", title: "You wrote this, so a regeneration will keep it." },
};

const PILL =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

export default function OriginBadge({ item }) {
  if (item?.pinned) {
    return (
      <span title="Pinned, so a regeneration will keep it." className={`${PILL} bg-mint text-ink/70`}>
        Pinned
      </span>
    );
  }

  const label = LABELS[item?.origin];
  if (!label) {
    return (
      <span
        title="Generated and unpinned — regenerating this section will replace it."
        className={`${PILL} bg-ink/[0.04] text-ink/50`}
      >
        Generated
      </span>
    );
  }

  return (
    <span title={label.title} className={`${PILL} bg-lavender text-ink/70`}>
      {label.text}
    </span>
  );
}
