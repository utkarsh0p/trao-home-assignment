"use client";

export default function PinButton({ pinned, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!pinned)}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      title={
        pinned
          ? "Pinned. Regenerating this section will leave it alone."
          : "Pin it so regenerating this section leaves it alone."
      }
      className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-lg
                  transition-colors duration-200 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1
                  ${pinned ? "bg-mint text-ink" : "text-ink/35 hover:bg-ink/5 hover:text-ink"}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none"
           stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
      </svg>
    </button>
  );
}
