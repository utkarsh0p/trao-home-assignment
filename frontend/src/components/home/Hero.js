import Button from "@/components/Button";
import { DeckMark } from "@/components/Wordmark";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-paper px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:px-12 lg:pb-24">
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[720px] w-[1100px]
                   -translate-x-1/2 rounded-full
                   bg-[radial-gradient(circle_at_center,rgba(220,233,255,0.9),rgba(247,247,243,0)_68%)]"
      />

      <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center text-center">
        <span
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink/10
                     bg-white/75 px-3 py-2 text-[10px] font-semibold uppercase
                     tracking-[0.08em] text-ink/60 shadow-sm backdrop-blur sm:text-xs"
        >
          <DeckMark className="size-3.5 text-accent" />
          Meet cember.
        </span>

        <h1
          className="max-w-[940px] text-[38px] font-semibold leading-[1] tracking-[-0.05em]
                     text-ink min-[390px]:text-[42px] sm:text-[64px] sm:leading-[0.98]
                     md:text-[76px] lg:text-[88px]"
        >
          Prep that comes from{" "}
          <span className="text-accent">the actual job.</span>
        </h1>

        <p className="mt-6 max-w-[720px] text-[15px] leading-[1.55] tracking-[-0.015em] text-ink/60 sm:mt-7 sm:text-xl">
          Paste the job description, point us at the company&rsquo;s site, and say how many
          days you have. cember. reads the posting, researches how the company actually
          hires, writes a question against every requirement it found, and lays the whole
          thing out day by day.
        </p>

        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:mt-10 sm:w-auto sm:flex-row">
          <Button href="/new" variant="primary" className="w-full sm:w-auto">
            Create a prep kit
            <Arrow />
          </Button>
          <Button href="#how-it-works" variant="secondary" className="w-full sm:w-auto">
            See how it works
          </Button>
        </div>

        {/* The brief rewards honesty over plausible filler. Say so on the front door. */}
        <p className="mt-8 max-w-[560px] text-sm font-medium leading-relaxed text-ink/50">
          Nothing is invented. If a posting is three lines long, the kit says so and covers
          what is genuinely there.
        </p>
      </div>
    </section>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
