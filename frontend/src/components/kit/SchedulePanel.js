"use client";

import RegenerateButton from "@/components/kit/RegenerateButton";
import ResourceList from "@/components/kit/ResourceList";
import { formatDuration } from "@/lib/format";
import { resolveSchedule, scheduleAudit } from "@/lib/kitDerive";
import * as api from "@/lib/api";

/**
 * Four kinds of day, each read off the data rather than off the generated `focus` copy.
 * A rest day is not a card — see RestRun.
 */
const DAY_STYLE = {
  teaching: { marker: "bg-ink text-white", label: null },
  review: { marker: "bg-sky text-ink", label: "Review" },
  final: { marker: "bg-ink text-white", label: "Last day" },
  rest: { marker: "bg-ink/[0.04] text-ink/50", label: null },
};

export default function SchedulePanel({ kit, mutate, refetch, onGoToQuestions, onPractise }) {
  const { days, unscheduled, totalMinutes } = resolveSchedule(kit);
  const audit = scheduleAudit(kit);
  const rows = groupRestRuns(days);

  // Which day is "now": the first session still outstanding. A plan you are partway
  // through should open on the day you owe, not on day one every time.
  const sessions = days.filter((day) => day.type !== "rest");
  const done = sessions.filter((day) => day.completedAt);
  const next = sessions.find((day) => !day.completedAt) ?? null;

  const toggleDay = (day) =>
    mutate(() => api.setDayComplete(kit._id, day.day, !day.completedAt));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
          {audit.daysRequested} day{audit.daysRequested === 1 ? "" : "s"} &middot;{" "}
          {formatDuration(totalMinutes)} of work
        </h2>
        <RegenerateButton kit={kit} section="schedule" refetch={refetch} label="the schedule" />
      </div>

      <PlanProgress done={done.length} total={sessions.length} next={next} />

      <ScheduleFindings audit={audit} unscheduled={unscheduled} onGoToQuestions={onGoToQuestions} />

      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 p-8 text-center">
          <p className="text-[15px] leading-[1.6] text-ink/60">This kit has no schedule.</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) =>
            row.kind === "rest" ? (
              <RestRun key={`rest-${row.from}`} from={row.from} to={row.to} />
            ) : (
              <DayCard
                key={row.day.day}
                day={row.day}
                isNext={row.day.day === next?.day}
                onToggle={toggleDay}
                onPractise={onPractise}
              />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

/**
 * The brief (§8) names four properties a schedule must have, and `scheduleAudit` still
 * recomputes every one of them from the plan on screen. Only the ones that FAIL render.
 *
 * A strip of green ticks confirming that a healthy plan is healthy is the app applauding
 * itself; the user asked for a schedule, not for evidence that we checked one. So a
 * schedule that holds says nothing at all, and a schedule that has drifted — after a
 * delete, a hand-added question, a regenerated category — gets one sand card naming
 * exactly what is wrong and what to press. Never red: drift is information, not an error.
 */
function ScheduleFindings({ audit, unscheduled, onGoToQuestions }) {
  const findings = [
    !audit.daysMatch &&
      `You asked for ${audit.daysRequested} days, the plan has ${audit.daysPlanned}. Rebuild to re-plan.`,

    audit.mustUnscheduled.length > 0 &&
      // Two causes, and they take different fixes: the question exists but is in no day
      // (rebuild), or nothing asks about the requirement at all (write one). Say both
      // rather than asserting the one that happens to be wrong.
      `${audit.mustUnscheduled.length} must-have${audit.mustUnscheduled.length === 1 ? " is" : "s are"} in no day: ${audit.mustUnscheduled
        .map((r) => r.text)
        .join("; ")}. Rebuild the schedule, or write a question covering them.`,

    audit.counts.teaching > 0 &&
      !audit.orderingHolds &&
      "Something harder now sits after something easier. Rebuild to re-sort.",

    audit.minutesDrift.length > 0 &&
      `${audit.minutesDrift.length} day${audit.minutesDrift.length === 1 ? "'s" : "s'"} minutes no longer match their questions — deleting a question does not re-time its day. Rebuild to re-time.`,

    audit.dangling.length > 0 &&
      `${audit.dangling.length} day${audit.dangling.length === 1 ? "" : "s"} still reference${audit.dangling.length === 1 ? "s" : ""} a deleted question. Rebuild to drop them.`,

    audit.unscheduledCards.length > 0 &&
      `${audit.unscheduledCards.length} of ${audit.cardTotal} flashcards are in no day. Rebuild to place them.`,
  ].filter(Boolean);

  const orphans = unscheduled.length;
  if (findings.length === 0 && orphans === 0) return null;

  return (
    <div className="rounded-2xl bg-sand p-5">
      <ul className="flex flex-col gap-2.5">
        {findings.map((finding) => (
          <li key={finding} className="text-[15px] leading-[1.6] text-ink/70">
            {finding}
          </li>
        ))}
        {/* Adding a question, or regenerating a category, never files it into a day — so
            this is a state the user reaches easily and should be told about. */}
        {orphans > 0 && (
          <li className="text-[15px] leading-[1.6] text-ink/70">
            {orphans} question{orphans === 1 ? " is" : "s are"} not in any day. Rebuild the
            schedule to place {orphans === 1 ? "it" : "them"}, or{" "}
            <button
              type="button"
              onClick={onGoToQuestions}
              className="cursor-pointer font-semibold text-ink underline underline-offset-4
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              go and see them
            </button>
            .
          </li>
        )}
      </ul>
    </div>
  );
}

/** Where you are in the plan, and the one thing to do next. */
function PlanProgress({ done, total, next }) {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-5 shadow-lifted">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-lg font-semibold tracking-[-0.02em] text-ink">
          {done === total ? "Every session done." : next ? `Next up: day ${next.day}` : "Plan ready."}
        </p>
        <p className="text-sm font-medium tabular-nums text-ink/50">
          {done} of {total} session{total === 1 ? "" : "s"} done
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Sessions completed"
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      {next && (
        <p className="mt-3 text-[15px] leading-[1.6] text-ink/60">
          {next.focus} &middot; {formatDuration(next.minutes)}
        </p>
      )}
    </div>
  );
}

/**
 * One day. What it is, how long it takes, and the questions in it.
 *
 * The requirement pills and the flashcard chip grid that used to sit here were both
 * grids of `truncate`d sentences — they rendered as ellipsis and meant nothing without a
 * hover, which a phone does not have. The questions themselves say what the day is for,
 * and the deck is a count with a button.
 */
function DayCard({ day, isNext, onToggle, onPractise }) {
  const style = DAY_STYLE[day.type];
  const complete = Boolean(day.completedAt);

  return (
    <li
      className={`rounded-2xl border bg-surface p-4 shadow-lifted transition-[border-color,opacity]
                  duration-200 sm:p-5 ${
                    isNext ? "border-accent/40" : "border-ink/10"
                  } ${complete ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${style.marker}`}
        >
          {day.day}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">
              {day.focus || "No focus recorded"}
              {style.label && (
                <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">
                  {style.label}
                </span>
              )}
            </h3>
            <span className="text-sm font-medium tabular-nums text-ink/50">
              {formatDuration(day.minutes)}
              {day.cards.length > 0 &&
                ` · ${day.cards.length} card${day.cards.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {day.questions.length === 0 ? (
            <p className="mt-2 text-[15px] leading-[1.6] text-ink/50">
              {day.danglingCount > 0
                ? "The questions planned for this day have been deleted."
                : "Nothing scheduled for this day."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {day.questions.map((question) => (
                <li
                  key={`${question.category}:${question.id}`}
                  className="flex items-start gap-3 rounded-xl bg-paper px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-[15px] leading-[1.5] text-ink/70">
                    {question.prompt}
                  </span>
                  <Difficulty level={question.difficulty ?? 2} />
                </li>
              ))}
            </ul>
          )}

          {/* Placed by buildSchedule on the days that teach what they are about, so
              there is nothing to choose here — and nothing on a rest day. */}
          {day.resources?.length > 0 && (
            <div className="mt-4 border-t border-ink/[0.07] pt-3">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
                Watch and read today
              </p>
              <ResourceList resources={day.resources} dense />
            </div>
          )}

          {day.type !== "rest" && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggle(day)}
                aria-pressed={complete}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2
                            text-sm font-semibold transition-colors duration-200
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-accent focus-visible:ring-offset-2 ${
                              complete
                                ? "bg-mint text-ink/70 hover:bg-mint/70"
                                : "border border-ink/20 bg-white/60 text-ink hover:border-ink/40 hover:bg-surface"
                            }`}
              >
                {complete ? "✓ Done" : "Mark day done"}
              </button>

              {day.cards.length > 0 && (
                <button
                  type="button"
                  onClick={onPractise}
                  className="inline-flex cursor-pointer items-center rounded-xl px-3.5 py-2 text-sm
                             font-semibold text-ink/60 transition-colors duration-200
                             hover:bg-ink/5 hover:text-ink focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  Practise the cards
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Three dots. No colour — difficulty is an amount, not a status (style.md §2). */
function Difficulty({ level }) {
  return (
    <span
      className="mt-1 flex shrink-0 items-center gap-1"
      title={`Difficulty ${level} of 3`}
      aria-label={`Difficulty ${level} of 3`}
    >
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          aria-hidden="true"
          className={`size-1.5 rounded-full ${step <= level ? "bg-ink/50" : "bg-ink/[0.12]"}`}
        />
      ))}
    </span>
  );
}

/**
 * A long runway is mostly rest. Rendering 47 identical cards for a 60-day plan buries the
 * 13 days that carry the material, so consecutive rest days collapse into one thin row.
 */
function RestRun({ from, to }) {
  const span = to - from + 1;
  return (
    <li className="rounded-xl border border-dashed border-ink/15 px-4 py-2.5">
      <p className="text-sm font-medium text-ink/50">
        {span === 1 ? `Day ${from}` : `Days ${from}–${to}`} &middot; no scheduled material
        {span > 1 && ` (${span} days)`}
      </p>
    </li>
  );
}

/** Collapses runs of consecutive rest days into a single row. */
function groupRestRuns(days) {
  const rows = [];
  for (const day of days) {
    if (day.type !== "rest") {
      rows.push({ kind: "day", day });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last?.kind === "rest" && last.to === day.day - 1) last.to = day.day;
    else rows.push({ kind: "rest", from: day.day, to: day.day });
  }
  return rows;
}
