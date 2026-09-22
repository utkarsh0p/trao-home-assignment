"use client";

import { coverageByRequirement } from "@/lib/kitDerive";

const KIND_TINTS = {
  technical: "bg-sky",
  behavioural: "bg-lavender",
  domain: "bg-mint",
};

/**
 * The requirements, each with the questions actually covering it right now. Computed
 * from the questions in hand rather than read from kit.coverage, which is only ever
 * written by a full pipeline run and goes stale the moment anything is edited.
 */
export default function RolePanel({ kit, onGoToQuestions }) {
  const requirements = coverageByRequirement(kit);
  const role = kit.role ?? {};
  const uncoveredMust = requirements.filter(
    (r) => r.priority === "must" && r.questions.length === 0,
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            {role.title || kit.source?.role || "The role"}
          </h2>
          {role.seniority && (
            <span className="rounded-full bg-ink/[0.04] px-3 py-1 text-xs font-semibold text-ink/60">
              {role.seniority}
            </span>
          )}
        </div>

        {(role.responsibilities ?? []).length > 0 ? (
          <ul className="mt-5 flex max-w-[680px] flex-col gap-2">
            {role.responsibilities.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-[1.6] text-ink/70">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink/20" />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70">
            The posting did not spell out responsibilities separately from its requirements.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            Requirements
            <span className="ml-3 text-base font-medium text-ink/50">{requirements.length}</span>
          </h2>
          <p className="text-sm font-medium text-ink/50">
            Marked must or nice from how the posting worded it.
          </p>
        </div>

        {uncoveredMust.length > 0 && (
          <div className="mt-4 rounded-2xl bg-sand p-4">
            <p className="text-[15px] leading-[1.6] text-ink/70">
              <b className="font-semibold text-ink">
                {uncoveredMust.length} must-have{uncoveredMust.length === 1 ? "" : "s"} with no
                question.
              </b>{" "}
              Regenerate the relevant category, or write one yourself in{" "}
              <button
                type="button"
                onClick={onGoToQuestions}
                className="cursor-pointer font-semibold text-ink underline underline-offset-4
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                           focus-visible:ring-offset-2"
              >
                the question bank
              </button>
              .
            </p>
          </div>
        )}

        {requirements.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-sand p-5 text-[15px] leading-[1.6] text-ink/70">
            Nothing could be extracted from this job description. That is reported rather
            than filled in with plausible-sounding requirements nobody asked for.
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {requirements.map((requirement) => {
              const bare = requirement.questions.length === 0;
              const critical = bare && requirement.priority === "must";

              return (
                <li
                  key={requirement.id}
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    critical ? "border-transparent bg-sand" : "border-ink/10 bg-surface"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-ink/35">
                      {requirement.id}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-ink/70 ${
                        requirement.priority === "must" ? "bg-sky" : "bg-ink/[0.06]"
                      }`}
                    >
                      {requirement.priority}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-ink/70 ${
                        KIND_TINTS[requirement.kind] ?? "bg-ink/[0.06]"
                      }`}
                    >
                      {requirement.kind}
                    </span>
                  </div>

                  <p className="mt-3 text-[17px] font-semibold leading-[1.4] tracking-[-0.02em] text-ink">
                    {requirement.text}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {bare ? (
                      <span className="text-[15px] leading-[1.6] text-ink/70">
                        {critical
                          ? "No question covers this must-have."
                          : "No question covers this yet."}
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/50">
                          Covered by
                        </span>
                        {requirement.questions.map((question) => (
                          <span
                            key={`${question.category}:${question.id}`}
                            title={question.prompt}
                            className="inline-flex items-center gap-1 rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-semibold text-ink/70"
                          >
                            {question.id}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
