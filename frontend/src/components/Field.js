// Label + control + error, wired for screen readers. style.md §6's input recipe, in one
// place so aria-invalid and aria-describedby can't be forgotten on a field-by-field basis.

// 16px below sm, not 15: iOS Safari zooms the page on any control it considers
// smaller than that, and the zoom does not come back when the field blurs.
const CONTROL =
  "w-full rounded-xl border bg-paper text-base text-ink placeholder:text-ink/35 " +
  "sm:text-[15px] transition-[border-color,box-shadow] duration-200 focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent/30";

export default function Field({
  id,
  label,
  error,
  hint,
  textarea = false,
  className = "",
  children,
  ...props
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  const border = error
    ? "border-[#DC2626]/40 focus:border-[#DC2626]/60"
    : "border-ink/[0.07] focus:border-accent/40";
  const size = textarea ? "h-auto min-h-[200px] resize-y px-4 py-3 leading-[1.6]" : "h-11 px-3.5";

  const Control = textarea ? "textarea" : "input";

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium text-ink/60">
          {label}
        </label>
        {children}
      </div>

      <Control
        id={id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
        className={`${CONTROL} ${border} ${size}`}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="mt-2 text-sm font-medium text-ink/50">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-2 text-sm font-medium text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  );
}
