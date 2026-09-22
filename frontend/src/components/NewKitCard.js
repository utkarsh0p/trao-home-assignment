import Link from "next/link";

// Sits in the kit grid as the last tile: the "start another one" affordance lives with
// the kits rather than as a second New kit button beside the header's filter, which said
// the same thing the nav already says. Ghost styling — dashed, unfilled — so it reads as
// a slot waiting to be filled, not as a kit that exists.

export default function NewKitCard() {
  return (
    <Link
      href="/new"
      className="group flex min-h-[220px] cursor-pointer flex-col items-center justify-center
                 gap-3 rounded-2xl border border-dashed border-ink/20 p-5
                 transition-[transform,border-color,background-color,color] duration-300
                 hover:-translate-y-1 hover:border-accent/50 hover:bg-accent/[0.03]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                 focus-visible:ring-offset-2 sm:p-6"
    >
      <span
        className="inline-flex size-11 items-center justify-center rounded-full bg-ink/[0.04]
                   text-ink/50 transition-colors duration-300 group-hover:bg-accent
                   group-hover:text-white"
      >
        <PlusGlyph />
      </span>
      <span className="text-[15px] font-semibold text-ink/60 transition-colors duration-300 group-hover:text-ink">
        New kit
      </span>
    </Link>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
