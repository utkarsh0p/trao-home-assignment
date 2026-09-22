"use client";

import InlineEdit from "@/components/kit/InlineEdit";
import OriginBadge from "@/components/kit/OriginBadge";
import PinButton from "@/components/kit/PinButton";
import RegenerateButton from "@/components/kit/RegenerateButton";
import { liveCoverage } from "@/lib/kitDerive";
import * as api from "@/lib/api";

export default function OverviewPanel({ kit, mutate, refetch, onGoToRole }) {
  const coverage = liveCoverage(kit);
  const notes = kit.notes ?? [];
  const errors = kit.researchErrors ?? [];
  const brief = kit.company_brief ?? {};

  const patchBrief = (body) => mutate(() => api.updateBrief(kit._id, body));

  return (
    <div className="flex flex-col gap-10">
      {/* What we could not find comes first. Reporting a thin result honestly is the
          point of §3.10, and burying it would defeat it. */}
      {notes.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            What we found, and what we didn&rsquo;t
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {notes.map((note) => (
              <li
                key={note}
                className="rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70"
              >
                {note}
              </li>
            ))}
          </ul>
        </section>
      )}

      {errors.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
            Sources we couldn&rsquo;t retrieve
          </h2>
          <p className="mt-2 text-[15px] leading-[1.6] text-ink/60">
            These were skipped rather than failing the run.
          </p>
          <ul className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10">
            {errors.map((error, index) => (
              <li
                key={`${error.code}-${index}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="font-mono text-xs font-semibold text-ink/50">{error.code}</span>
                <span className="text-[15px] text-ink/70">{error.message}</span>
                {error.step && (
                  <span className="ml-auto text-xs font-medium text-ink/35">{error.step}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">Coverage</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div
            className={`rounded-2xl p-5 ${
              coverage.uncoveredMust.length > 0 ? "bg-sand" : "bg-mint"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
              Right now
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink">
              {coverage.coveredCount} of {coverage.total} requirements covered
            </p>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink/70">
              {coverage.uncoveredMust.length > 0 ? (
                <>
                  {coverage.uncoveredMust.length} must-have
                  {coverage.uncoveredMust.length === 1 ? " has" : "s have"} no question.{" "}
                  <button
                    type="button"
                    onClick={onGoToRole}
                    className="cursor-pointer font-semibold text-ink underline underline-offset-4
                               focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    See which
                  </button>
                </>
              ) : (
                "Every must-have requirement has at least one question against it."
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-ink/10 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60 sm:text-xs">
              When it was generated
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink">
              {kit.coverage?.passes ?? 0} pass
              {(kit.coverage?.passes ?? 0) === 1 ? "" : "es"}
            </p>
            <p className="mt-2 text-[15px] leading-[1.6] text-ink/60">
              The generator checked its questions against the requirements and wrote more
              where it found gaps.{" "}
              {(kit.coverage?.uncovered_requirement_ids?.length ?? 0) > 0
                ? `It finished with ${kit.coverage.uncovered_requirement_ids.length} still uncovered.`
                : "It closed every gap."}{" "}
              This figure records that run; the panel on the left is live.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">Company brief</h2>
            <OriginBadge item={brief} />
            <PinButton
              pinned={brief.pinned}
              label="the company brief"
              onToggle={(pinned) => patchBrief({ pinned })}
            />
          </div>
          <RegenerateButton kit={kit} section="company_brief" refetch={refetch} label="brief" />
        </div>

        <div className="mt-4 max-w-[680px]">
          <InlineEdit
            label="company brief summary"
            value={brief.summary}
            placeholder="No summary — click to write one."
            onCommit={(summary) => patchBrief({ summary })}
            textClassName="text-lg leading-[1.6] text-ink/70"
          />
          <p className="mt-6 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50">
            What they do
          </p>
          <InlineEdit
            label="what the company does"
            value={brief.what_they_do}
            placeholder="Nothing recorded — click to write it."
            onCommit={(what_they_do) => patchBrief({ what_they_do })}
            textClassName="text-lg leading-[1.6] text-ink/60"
          />
        </div>

        {(brief.sources ?? []).length > 0 && (
          <div className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50 sm:text-xs">
              Sourced from
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {brief.sources.map((url) => (
                <li key={url}>
                  <SourcePill url={url} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">The research trail</h2>
        <p className="mt-2 max-w-[680px] text-[15px] leading-[1.6] text-ink/60">
          Every page we actually read while building this kit. The job description itself
          was pasted, never fetched.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <Fact label="Company" value={kit.source?.company || "—"} />
          <Fact label="Role" value={kit.source?.role || "—"} />
          <Fact
            label="Job description"
            value={`${(kit.source?.jd_chars ?? 0).toLocaleString()} characters`}
          />
        </dl>
        {(kit.source?.pages_used ?? []).length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {kit.source.pages_used.map((url) => (
              <li key={url}>
                <SourcePill url={url} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl bg-sand p-4 text-[15px] leading-[1.6] text-ink/70">
            No pages could be read from the company site.
          </p>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-2xl border border-ink/10 p-4">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50 sm:text-xs">
        {label}
      </dt>
      <dd className="mt-1.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

function SourcePill({ url }) {
  let display = url;
  try {
    const parsed = new URL(url);
    display = `${parsed.hostname.replace(/^www\./, "")}${
      parsed.pathname === "/" ? "" : parsed.pathname
    }`;
  } catch {
    /* show it raw */
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex max-w-[280px] items-center gap-1.5 truncate rounded-full bg-sky px-3 py-1
                 text-xs font-semibold text-ink/70 transition-opacity duration-200 hover:opacity-80
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                 focus-visible:ring-offset-2"
    >
      {display}
    </a>
  );
}
