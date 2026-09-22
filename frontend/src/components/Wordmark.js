// The brand, defined once: a deck mark plus the wordmark. Header, footer and
// splash all render this, so the logo can never drift between them.

const SIZES = {
  sm: { text: "text-xl", mark: "size-[18px]", gap: "gap-1.5" },
  md: { text: "text-3xl", mark: "size-6", gap: "gap-2" },
  lg: {
    text: "text-[44px] sm:text-[68px] lg:text-[80px]",
    mark: "size-[34px] sm:size-[52px] lg:size-[62px]",
    gap: "gap-2 sm:gap-4",
  },
};

export default function Wordmark({ size = "sm", className = "" }) {
  const { text, mark, gap } = SIZES[size] ?? SIZES.sm;

  return (
    <span className={`inline-flex items-center ${gap} ${className}`}>
      <DeckMark className={`${mark} shrink-0 text-accent`} />
      <span
        className={`${text} font-semibold italic leading-none tracking-[-0.04em] text-accent`}
      >
        cember.
      </span>
    </span>
  );
}

/* Hand-rolled rather than pulling in an icon package — style.md §9 keeps that a
   tech-stack decision, and the mark is three rectangles: a deck of prep cards.
   The cards are separated by opacity rather than outlines, so the whole mark
   stays one `currentColor` and survives being shrunk to 14px in the hero pill. */
export function DeckMark({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <rect x="10" y="3" width="11.5" height="15" rx="2" opacity="0.3" />
      <rect x="6.25" y="4.75" width="11.5" height="15" rx="2" opacity="0.55" />
      <rect x="2.5" y="6.5" width="11.5" height="15" rx="2" />
    </svg>
  );
}
