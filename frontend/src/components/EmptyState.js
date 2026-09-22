// A real screen for "there is nothing here", per style.md §1.5 — not a skeleton
// pretending content is on its way.

export default function EmptyState({ title, children, actions }) {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col items-center rounded-2xl border border-ink/10 bg-surface p-8 text-center shadow-lifted sm:p-10">
      <h3 className="text-2xl font-semibold tracking-[-0.035em] text-ink">{title}</h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-ink/60 sm:text-base">{children}</p>
      {actions && (
        <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{actions}</div>
      )}
    </div>
  );
}
