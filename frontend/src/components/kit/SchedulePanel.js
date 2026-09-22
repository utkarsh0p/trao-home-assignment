"use client";

import RegenerateButton from "@/components/kit/RegenerateButton";
import { CATEGORY_LABELS, resolveSchedule } from "@/lib/kitDerive";

export default function SchedulePanel({ kit, refetch, onGoToQuestions }) {
  const { days, unscheduled, totalMinutes } = resolveSchedule(kit);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            {kit.schedule?.days_available ?? days.length} days,{" "}
            {Math.round(totalMinutes / 60)} hour{Math.round(totalMinutes / 60) === 1 ? "" : "s"}{" "}
            of work
          </h2>
          <p className="mt-2 max-w-[560px] text-[15px] leading-[1.6] text-ink/60">
            Harder and higher-priority material lands earlier, not the night before. The
            allocation is arithmetic in code, never a model call.
          </p>
        </div>
        <RegenerateButton kit={kit} section="schedule" refetch={refetch} label="the schedule" />
      </div>

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
          {days.map((day) => (
            <li
              key={day.day}
              className="rounded-2xl border border-ink/10 bg-surface p-4 shadow-lifted sm:p-5"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                  {day.day}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">
                      {day.focus || "No focus recorded"}
                    </h3>
                    <span className="text-sm font-medium tabular-nums text-ink/50">
                      {day.minutes} min
                    </span>
                  </div>

                  {day.questions.length === 0 ? (
                    <p className="mt-2 text-[15px] leading-[1.6] text-ink/50">
                      Nothing scheduled for this day.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {day.questions.map((question) => (
                        <li
                          key={`${question.category}:${question.id}`}
                          className="flex gap-3 rounded-xl bg-paper px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 text-[15px] leading-[1.5] text-ink/70">
                            {question.prompt}
                          </span>
                          <span className="hidden shrink-0 rounded-full bg-lavender px-2.5 py-0.5 text-[11px] font-semibold text-ink/70 sm:inline-flex">
                            {CATEGORY_LABELS[question.category] ?? question.category}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
