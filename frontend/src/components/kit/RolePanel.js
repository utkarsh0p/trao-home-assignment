"use client";

import { liveCoverage } from "@/lib/kitDerive";

/**
 * The role breakdown — what they are asking for, marked must or nice exactly as the
 * posting worded it (§5). Read-only: §6 makes the question bank, the flashcards, the
 * brief and the schedule reshapeable, and stops there.
 *
 * Requirement ids and the questions covering each one are deliberately absent. Those
 * exist so coverage is checkable in the JSON, and the automated pass checks it there.
 * The one part of coverage a candidate can act on is the gap, so that is all that shows.
 */
export default function RolePanel({ kit, onGoToQuestions }) {
  const role = kit.role ?? {};
  const requirements = role.requirements ?? [];
  const must = requirements.filter((r) => r.priority === "must");
  const nice = requirements.filter((r) => r.priority !== "must");
  const { uncoveredMust } = liveCoverage(kit);

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
          <>
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
              What you&rsquo;d be doing
            </p>
            <ul className="mt-3 flex max-w-[680px] flex-col gap-2">
              {role.responsibilities.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] leading-[1.6] text-ink/70">
                  <Dot />
                  {item}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 max-w-[680px] rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70">
            The posting did not spell out responsibilities separately from its requirements.
          </p>
        )}
      </section>

      {/* The only part of coverage worth a candidate's attention: where prep is thin. */}
      {uncoveredMust.length > 0 && (
        <div className="max-w-[680px] rounded-2xl bg-sand p-5">
          <p className="text-[15px] leading-[1.6] text-ink/70">
            <b className="font-semibold text-ink">
              {uncoveredMust.length} must-have{uncoveredMust.length === 1 ? " has" : "s have"} no
              question yet:
            </b>{" "}
            {uncoveredMust.map((r) => r.text).join("; ")}.{" "}
            <button
              type="button"
              onClick={onGoToQuestions}
              className="cursor-pointer font-semibold text-ink underline underline-offset-4
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Write one
            </button>
          </p>
        </div>
      )}

      {requirements.length === 0 ? (
        <p className="max-w-[680px] rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70">
          No requirements could be pulled out of this posting.
        </p>
      ) : (
        <section className="grid gap-10 sm:grid-cols-2">
          <RequirementList title="Must have" items={must} />
          <RequirementList title="Nice to have" items={nice} />
        </section>
      )}
    </div>
  );
}

function RequirementList({ title, items }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">
        {title}
        <span className="ml-3 text-base font-medium text-ink/50">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-[15px] leading-[1.6] text-ink/50">
          Nothing in this group.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {items.map((requirement) => (
            <li
              key={requirement.id}
              className="flex gap-3 text-[15px] leading-[1.6] text-ink/70"
            >
              <Dot />
              {requirement.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink/20" />;
}
