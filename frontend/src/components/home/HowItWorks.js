import Button from "@/components/Button";
import Reveal from "@/components/Reveal";

// Three cards, tinted lavender / ink / mint. The middle one goes dark on purpose:
// crawling the company is the step that separates this from a prompt, so it gets
// the weight. Each card's little diagram is inert — it illustrates, it isn't a demo.

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 bg-surface px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
            How it works
          </span>
          <h2 className="max-w-[940px] text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-ink sm:text-[38px] lg:text-5xl">
            Read the posting. Research the company. Build the plan.
          </h2>
          <p className="mt-4 max-w-[720px] text-[15px] leading-[1.55] tracking-[-0.015em] text-ink/60 sm:mt-5 sm:text-xl">
            Three steps, in that order, because each one changes the next.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:gap-6 lg:grid-cols-3">
          <Reveal className="flex" delay={0}>
            <Card
              tone="lavender"
              eyebrow="1 · Paste the job"
              title="Requirements, pulled out and marked."
              diagram={<RequirementsDiagram />}
            >
              Every line of the posting becomes a requirement with a stable id, sorted into
              technical, behavioural or domain, and marked <b className="font-semibold">must</b>{" "}
              or <b className="font-semibold">nice</b> based on how the posting worded it.
              &ldquo;Required&rdquo; and &ldquo;bonus points for&rdquo; are not the same thing.
            </Card>
          </Reveal>

          <Reveal className="flex" delay={0.08}>
            <Card
              tone="ink"
              eyebrow="2 · We research"
              title="We read the company, not just the ad."
              diagram={<ResearchDiagram />}
            >
              primer. crawls the company&rsquo;s site looking for how they actually hire, then
              searches for public accounts of their process. A company that publishes a
              take-home and a system design round gets a different kit from one that says
              nothing at all.
            </Card>
          </Reveal>

          <Reveal className="flex" delay={0.16}>
            <Card
              tone="mint"
              eyebrow="3 · Practise"
              title="Every must-have gets a question, then a day."
              diagram={<ScheduleDiagram />}
            >
              Questions are checked against the requirements in code, not by asking a model
              &mdash; anything uncovered goes back for a second pass. What survives is spread
              across exactly the days you have, hardest material first.
            </Card>
          </Reveal>
        </div>

        <div className="mt-12 flex justify-center">
          <Button href="/new" variant="primary">
            Create a prep kit
          </Button>
        </div>
      </div>
    </section>
  );
}

const TONES = {
  lavender: { card: "bg-lavender", eyebrow: "text-ink/60", title: "text-ink", body: "text-ink/70" },
  mint: { card: "bg-mint", eyebrow: "text-ink/60", title: "text-ink", body: "text-ink/70" },
  // On the ink card the grey rule inverts: secondary text is white at an opacity step.
  ink: { card: "bg-ink", eyebrow: "text-white/60", title: "text-white", body: "text-white/60" },
};

function Card({ tone, eyebrow, title, diagram, children }) {
  const t = TONES[tone];

  return (
    <div className={`flex w-full flex-col rounded-2xl p-6 sm:p-8 ${t.card}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-xs ${t.eyebrow}`}>
        {eyebrow}
      </span>
      <h3 className={`mt-4 text-2xl font-semibold tracking-[-0.035em] ${t.title}`}>{title}</h3>
      <p className={`mt-3 text-[15px] leading-[1.6] ${t.body}`}>{children}</p>
      <div className="mt-auto pt-8">{diagram}</div>
    </div>
  );
}

function RequirementsDiagram() {
  const rows = [
    { text: "5+ years with React", tag: "must" },
    { text: "Mentoring junior engineers", tag: "must" },
    { text: "Exposure to Kubernetes", tag: "nice" },
  ];

  return (
    <div aria-hidden="true" className="flex flex-col gap-2 rounded-xl bg-white/70 p-3">
      {rows.map((row) => (
        <div key={row.text} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
          <span className="truncate text-[13px] font-medium text-ink/70">{row.text}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70 ${
              row.tag === "must" ? "bg-sky" : "bg-ink/[0.06]"
            }`}
          >
            {row.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function ResearchDiagram() {
  const steps = [
    { label: "Crawled 14 pages", done: true },
    { label: "Found /careers/how-we-hire", done: true },
    { label: "Searched public accounts", done: true },
  ];

  return (
    <div aria-hidden="true" className="flex flex-col gap-2 rounded-xl bg-white/[0.06] p-3">
      {steps.map((step) => (
        <div key={step.label} className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-3 py-2">
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-mint">
            <svg viewBox="0 0 12 12" className="size-2.5 text-ink" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.2l2.4 2.4 4.6-5" />
            </svg>
          </span>
          <span className="truncate text-[13px] font-medium text-white/70">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleDiagram() {
  const days = [
    { day: 1, focus: "System design", minutes: 90 },
    { day: 2, focus: "React depth", minutes: 60 },
    { day: 3, focus: "Behavioural", minutes: 45 },
  ];

  return (
    <div aria-hidden="true" className="flex flex-col gap-2 rounded-xl bg-white/70 p-3">
      {days.map((entry) => (
        <div key={entry.day} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
            {entry.day}
          </span>
          <span className="flex-1 truncate text-[13px] font-medium text-ink/70">{entry.focus}</span>
          <span className="shrink-0 text-[11px] font-semibold text-ink/50">{entry.minutes} min</span>
        </div>
      ))}
    </div>
  );
}
