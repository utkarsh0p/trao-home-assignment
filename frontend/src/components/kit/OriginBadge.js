import { isReplaceable } from "@/lib/kitDerive";

// The regeneration contract, made legible before anyone presses the button rather than
// only explicable afterwards. Only `generated` and unpinned items can be thrown away.

const LABELS = {
  edited: { text: "Edited", tint: "bg-lavender", title: "You changed this, so a regeneration will keep it." },
  manual: { text: "Yours", tint: "bg-lavender", title: "You wrote this, so a regeneration will keep it." },
};

export default function OriginBadge({ item }) {
  if (item.pinned) {
    return (
      <span
        title="Pinned, so a regeneration will keep it."
        className="inline-flex items-center gap-1 rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-semibold text-ink/70"
      >
        Pinned
      </span>
    );
  }

  const label = LABELS[item.origin];
  if (!label) {
    return (
      <span
        title="Generated and unpinned — regenerating this section will replace it."
        className="inline-flex items-center gap-1 rounded-full bg-ink/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-ink/50"
      >
        Generated
      </span>
    );
  }

  return (
    <span
      title={label.title}
      className={`inline-flex items-center gap-1 rounded-full ${label.tint} px-2.5 py-0.5 text-[11px] font-semibold text-ink/70`}
    >
      {label.text}
    </span>
  );
}

/** One line of plain English about what happens to this item on regeneration. */
export function replaceabilityHint(item) {
  if (item.pinned) return "Pinned — a regeneration keeps this.";
  if (item.origin === "edited") return "You edited this, so a regeneration keeps it.";
  if (item.origin === "manual") return "You wrote this, so a regeneration keeps it.";
  return "Regenerating this section will replace this.";
}

export { isReplaceable };
