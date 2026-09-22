import Button from "@/components/Button";

// Placeholder for the screens landing in the next passes. It exists so that every
// link in the nav, the hero and the kit cards resolves to something honest rather
// than a 404 — the shell is finished, these screens are not.

export default function ComingSoon({ title, children }) {
  return (
    <section className="bg-paper px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto flex w-full max-w-[680px] flex-col items-center rounded-2xl border border-ink/10 bg-surface p-8 text-center shadow-lifted sm:p-10">
        <span className="mb-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
          Not built yet
        </span>
        <h1 className="text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-ink/60 sm:text-base">{children}</p>
        <div className="mt-8">
          <Button href="/" variant="secondary">
            Back to home
          </Button>
        </div>
      </div>
    </section>
  );
}
