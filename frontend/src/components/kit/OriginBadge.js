/**
 * Whether a regeneration would keep this thing.
 *
 * Only non-default states render. Generated-and-unpinned is ~90% of items and is what a
 * user already assumes, so it says nothing at all — a grey "Generated" pill beside every
 * heading was chrome restating the default. "You wrote this" and "this is pinned" are the
 * states worth a glance, because they change what Regenerate does.
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
  if (!label) return null;

  return (
    <span title={label.title} className={`${PILL} bg-lavender text-ink/70`}>
      {label.text}
    </span>
  );
}
