// The brand, defined once: a cursor mark plus the wordmark. Header, footer and
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
      <CursorMark className={`${mark} shrink-0 text-accent`} />
      <span
        className={`${text} font-semibold italic leading-none tracking-[-0.04em] text-accent`}
      >
        primer.
      </span>
    </span>
  );
}

/* Hand-rolled rather than pulling in an icon package — style.md §9 keeps that a
   tech-stack decision, and the mark is one path. */
export function CursorMark({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <path d="M4.6 2.4a1 1 0 0 1 1.05-.16l14.1 6.5a1 1 0 0 1-.06 1.84l-5.7 2.2a1 1 0 0 0-.57.57l-2.2 5.7a1 1 0 0 1-1.84.06L2.24 5.01a1 1 0 0 1 .16-1.05Z" />
    </svg>
  );
}
