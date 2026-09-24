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
  const brief = kit.company_brief ?? {};
  // Notes and unretrievable sources are two arrays of the same thing from the user's side
  // — something we looked for and did not get. One list, deduped.
  const gaps = [
    ...new Set([
      ...(kit.notes ?? []),
      ...(kit.researchErrors ?? []).map((error) => error.message),
    ]),
  ];

  const patchBrief = (body) => mutate(() => api.updateBrief(kit._id, body));

  return (
    <div className="flex flex-col gap-10">
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

      {/* A thin result reported honestly is the point of §10, so it stays — but it used to
          open the page as two stacked sand banners under a headline, which made the first
          thing you saw on your own prep kit a list of what we failed to find. The brief
          leads; the gaps sit under it, quietly, still in full. */}
      {gaps.length > 0 && (
        <section className="max-w-[680px] border-t border-ink/10 pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50 sm:text-xs">
            What we couldn&rsquo;t find
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {gaps.map((gap) => (
              <li key={gap} className="flex gap-3 text-[15px] leading-[1.6] text-ink/60">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink/20" />
                {gap}
              </li>
            ))}
          </ul>
        </section>
      )}
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
