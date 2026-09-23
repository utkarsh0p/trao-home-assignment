"use client";

import RegenerateButton from "@/components/kit/RegenerateButton";
import { formatDuration } from "@/lib/format";
import { resolveSchedule, scheduleAudit } from "@/lib/kitDerive";

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

export default function SchedulePanel({ kit, refetch, onGoToQuestions }) {
  const { days, unscheduled, totalMinutes } = resolveSchedule(kit);
  const audit = scheduleAudit(kit);
  const rows = groupRestRuns(days);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            {audit.daysRequested} day{audit.daysRequested === 1 ? "" : "s"} &middot;{" "}
            {formatDuration(totalMinutes)} of work
          </h2>
          <p className="mt-2 max-w-[560px] text-[15px] leading-[1.6] text-ink/60">
            Allocation is arithmetic in code, never a model call. The checks below are
            recomputed from the plan on screen, not copied from the generation run.
          </p>
        </div>
        <RegenerateButton kit={kit} section="schedule" refetch={refetch} label="the schedule" />
      </div>

      <ScheduleChecks audit={audit} />

      {/* Adding a question, or regenerating a category, never files it into a day — so
          this is a state the user reaches easily and should be told about. */}
      {unscheduled.length > 0 && (
        <div className="rounded-2xl bg-sand p-5">
          <p className="text-[15px] leading-[1.6] text-ink/70">
            <b className="font-semibold text-ink">
              {unscheduled.length} question{unscheduled.length === 1 ? " is" : "s are"} not in
              any day.
            </b>{" "}
            Questions you add by hand, and questions from a regenerated category, are not
            filed into the plan automatically. Rebuild the schedule above to place them.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unscheduled.map((question) => (
              <li key={`${question.category}:${question.id}`}>
                <button
                  type="button"
                  onClick={onGoToQuestions}
                  className="max-w-[320px] cursor-pointer truncate rounded-full bg-white/70 px-3 py-1
                             text-[11px] font-semibold text-ink/70 transition-opacity duration-200
                             hover:opacity-80 focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-accent focus-visible:ring-offset-1"
                >
                  {question.prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
              <DayCard key={row.day.day} day={row.day} />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

/**
 * The brief (§8) names four properties a schedule must have. The panel used to assert the
 * ordering one in prose and show no evidence; these are computed from the plan on screen,
 * so an edit that breaks one says so. A broken property is `sand` — a finding, not a
 * failure, per style.md §2.
 */
function ScheduleChecks({ audit }) {
  const checks = [
    audit.daysMatch
      ? { ok: true, text: `Spans all ${audit.daysRequested} day${audit.daysRequested === 1 ? "" : "s"} you asked for` }
      : {
          ok: false,
          text: `You asked for ${audit.daysRequested} days, the plan has ${audit.daysPlanned}`,
        },
    audit.mustTotal === 0
      ? null
      : audit.mustUnscheduled.length === 0
        ? { ok: true, text: `All ${audit.mustTotal} must-have requirement${audit.mustTotal === 1 ? "" : "s"} appear in the plan` }
        : {
            ok: false,
            text: `${audit.mustUnscheduled.length} must-have${audit.mustUnscheduled.length === 1 ? "" : "s"} not in any day: ${audit.mustUnscheduled
              .map((r) => r.text)
              .join("; ")}`,
          },
    audit.counts.teaching === 0
      ? null
      : audit.orderingHolds
        ? { ok: true, text: "Hardest and highest-priority material lands earliest" }
        : { ok: false, text: "Something harder now sits after something easier — rebuild to re-sort" },
    audit.minutesDrift.length === 0
      ? null
      : {
          ok: false,
          text: `${audit.minutesDrift.length} day${audit.minutesDrift.length === 1 ? "'s" : "s'"} minutes no longer match their questions — deleting a question does not re-time the day`,
        },
    audit.dangling.length === 0
      ? null
      : {
          ok: false,
          text: `${audit.dangling.length} day${audit.dangling.length === 1 ? "" : "s"} still reference${audit.dangling.length === 1 ? "s" : ""} a deleted question`,
        },
  ].filter(Boolean);

  return (
    <ul className="flex flex-col gap-2">
      {checks.map((check) => (
        <li
          key={check.text}
          className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-[15px] leading-[1.5] text-ink/70 ${
            check.ok ? "bg-mint" : "bg-sand"
          }`}
        >
          <span aria-hidden="true" className="mt-px shrink-0 font-semibold text-ink">
            {check.ok ? "✓" : "›"}
          </span>
          <span>{check.text}</span>
        </li>
      ))}
    </ul>
  );
}

function DayCard({ day }) {
  const style = DAY_STYLE[day.type];

  return (
    <li className="rounded-2xl border border-ink/10 bg-surface p-4 shadow-lifted sm:p-5">
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
              {day.minutesDrift !== 0 && (
                <span className="ml-1.5 font-semibold text-ink/70">
                  &middot; {formatDuration(day.questions.length * 15)} of material
                </span>
              )}
            </span>
          </div>

          {/* What this day is actually FOR. `focus` only names the top two categories; the
              requirement text is the thing the user is being asked to be ready on. */}
          {day.requirements.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {day.requirements.map((requirement) => (
                <li
                  key={requirement.id}
                  title={requirement.text}
                  className="max-w-[280px] truncate rounded-full bg-lavender px-2.5 py-0.5 text-[11px] font-semibold text-ink/70"
                >
                  {requirement.text}
                </li>
              ))}
            </ul>
          )}

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
                  {/* The category pill that used to sit here just restated the day's own
                      focus, and was hidden on phones anyway. Difficulty is the thing the
                      ordering claim is made of, so it earns the slot. */}
                  <Difficulty level={question.difficulty ?? 2} />
                </li>
              ))}
            </ul>
          )}

          {day.repeatQuestions.length > 0 && day.newQuestions.length > 0 && (
            <p className="mt-2 text-sm font-medium text-ink/50">
              {day.repeatQuestions.length} of these came round before.
            </p>
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
