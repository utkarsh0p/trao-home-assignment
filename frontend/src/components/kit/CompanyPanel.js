"use client";

import InlineEdit from "@/components/kit/InlineEdit";
import OriginBadge from "@/components/kit/OriginBadge";
import PinButton from "@/components/kit/PinButton";
import RegenerateButton from "@/components/kit/RegenerateButton";
import * as api from "@/lib/api";

/**
 * The company brief — one of the five things the brief says the user reads, and the only
 * section besides the schedule that §6 names as both editable inline and regenerable.
 *
 * Nothing else lives here. The generation-pass count, the character count of the pasted
 * JD and the page-by-page research trail were all pipeline telemetry: true, but written
 * for whoever built the pipeline rather than for whoever is sitting the interview.
 */
export default function CompanyPanel({ kit, mutate, refetch }) {
  const notes = kit.notes ?? [];
  const errors = kit.researchErrors ?? [];
  const brief = kit.company_brief ?? {};

  const patchBrief = (body) => mutate(() => api.updateBrief(kit._id, body));

  return (
    <div className="flex flex-col gap-10">
      {/* What we could not find comes first. A thin result reported honestly is the point
          of §10, and burying it would defeat it. */}
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
              <li key={`${error.code}-${index}`} className="px-4 py-3">
                <span className="text-[15px] leading-[1.6] text-ink/70">{error.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">The brief</h2>
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
          <div className="mt-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50 sm:text-xs">
              Read from
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
