// The API speaks { error: { code, message } } and the batch output reuses the same code
// vocabulary. Show the human half prominently, keep the code available beneath it.
// Sand, never red — style.md §2: a problem the user can act on is information.

export default function ErrorCallout({ title, error, children }) {
  return (
    <div className="rounded-2xl bg-sand p-5 sm:p-6">
      {title && (
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      )}
      <p className={`text-[15px] leading-[1.6] text-ink/70 ${title ? "mt-2" : ""}`}>
        {error?.message ?? "Something went wrong."}
      </p>
      {error?.code && <p className="mt-3 font-mono text-sm text-ink/50">{error.code}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
