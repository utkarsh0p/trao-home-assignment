"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/Button";
import ErrorCallout from "@/components/ErrorCallout";
import JobQueueRow from "@/components/new/JobQueueRow";
import { createJob } from "@/lib/api";
import { checkDays, normalizeCompanyUrl } from "@/lib/validation";

// generationLimiter allows 20 generations per user per hour, and regenerating a section
// spends from the same budget. Ten keeps a batch well clear of it.
const MAX_ROWS = 10;
const QUEUE_KEY = "primer:batch-queue";

export default function BatchUpload() {
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState(null);
  const [queue, setQueue] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [stoppedBy, setStoppedBy] = useState(null);
  const inputRef = useRef(null);

  // A refresh mid-batch should pick the queue back up, not lose track of runs that are
  // still going. The jobs themselves live on the server; this is just the id list.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(QUEUE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setQueue(JSON.parse(stored));
    } catch {
      /* a corrupt queue is not worth a screen */
    }
  }, []);

  function persist(next) {
    setQueue(next);
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  }

  async function onFile(file) {
    setFileError(null);
    setRows([]);

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setFileError({ code: "BAD_JSON", message: `${file.name} isn't valid JSON.` });
      return;
    }

    if (!Array.isArray(parsed)) {
      setFileError({
        code: "BAD_SHAPE",
        message: "The file must be a JSON array of cases, the same shape the batch command takes.",
      });
      return;
    }
    if (parsed.length === 0) {
      setFileError({ code: "EMPTY", message: "That file has no cases in it." });
      return;
    }
    if (parsed.length > MAX_ROWS) {
      setFileError({
        code: "TOO_MANY_CASES",
        message: `${parsed.length} cases, but the limit here is ${MAX_ROWS}. The API allows 20 generations per hour and regenerating a section spends from the same budget — run the rest as a second batch, or use "npm run evaluate" for a large set.`,
      });
      return;
    }

    setRows(parsed.map(toRow));
  }

  async function submitAll() {
    setSubmitting(true);
    setStoppedBy(null);

    const started = [];
    // One at a time: a burst would hit the rate limiter and the LLM concurrency cap at
    // once, and the failures would be indistinguishable from real ones.
    for (const row of rows.filter((row) => !row.error)) {
      try {
        const { job } = await createJob({
          jd: row.jd,
          companyUrl: row.companyUrl,
          days: row.days,
        });
        started.push({ key: row.key, label: row.label, jobId: job.id, kitId: job.kitId ?? null });
        persist([...queue, ...started]);
      } catch (error) {
        setStoppedBy(error);
        break;
      }
    }

    setRows([]);
    if (inputRef.current) inputRef.current.value = "";
    setSubmitting(false);
  }

  const valid = rows.filter((row) => !row.error);

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-6 shadow-lifted sm:p-8">
      <h2 className="text-2xl font-semibold tracking-[-0.035em] text-ink">
        Several roles at once
      </h2>
      <p className="mt-3 text-[15px] leading-[1.6] text-ink/70">
        Drop in a JSON array of cases &mdash; the same shape{" "}
        <code className="rounded-[6px] bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.9em]">
          npm run evaluate
        </code>{" "}
        takes. Up to {MAX_ROWS} at a time; they run one after another.
      </p>

      <pre className="mt-4 overflow-x-auto rounded-xl bg-ink/[0.04] p-4 font-mono text-[13px] leading-[1.6] text-ink/70">
{`[
  { "id": "acme-backend",
    "jd": "Senior Backend Engineer\\n\\nWe are looking for ...",
    "company_url": "acme.com",
    "days": 5 }
]`}
      </pre>

      <div className="mt-6">
        <label
          htmlFor="cases"
          className="mb-2 block text-sm font-medium text-ink/60"
        >
          Cases file
        </label>
        <input
          ref={inputRef}
          id="cases"
          type="file"
          accept="application/json,.json"
          disabled={submitting}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
          className="w-full cursor-pointer rounded-xl border border-ink/[0.07] bg-paper p-3 text-[15px]
                     text-ink/70 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0
                     file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white
                     focus:border-accent/40 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent/30"
        />
      </div>

      {fileError && (
        <div className="mt-5">
          <ErrorCallout title="Couldn't read that file." error={fileError} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/10">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0 truncate text-[15px] font-medium text-ink">
                  {row.label}
                </span>
                {row.error ? (
                  <span className="shrink-0 rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink/70">
                    {row.error}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-ink/70">
                    {row.days}-day plan
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={submitAll} disabled={submitting || valid.length === 0}>
              {submitting ? "Queueing…" : `Build ${valid.length} kit${valid.length === 1 ? "" : "s"}`}
            </Button>
            {rows.length !== valid.length && (
              <span className="text-sm font-medium text-ink/50">
                {rows.length - valid.length} case
                {rows.length - valid.length === 1 ? "" : "s"} will be skipped.
              </span>
            )}
          </div>
        </div>
      )}

      {stoppedBy && (
        <div className="mt-6">
          <ErrorCallout
            title="The queue stopped early."
            error={{
              ...stoppedBy,
              message:
                stoppedBy.code === "TOO_MANY_GENERATIONS"
                  ? "You have used this hour's 20 generations. The ones already queued below will still finish."
                  : stoppedBy.message,
            }}
          />
        </div>
      )}

      {queue.length > 0 && (
        <div className="mt-8 border-t border-ink/10 pt-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">In progress</h3>
            <button
              type="button"
              onClick={() => persist([])}
              className="cursor-pointer rounded-lg text-sm font-medium text-ink/50 transition-colors
                         duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Clear list
            </button>
          </div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-ink/50">
            These keep running if you leave. Every finished kit lands in My kits.
          </p>
          <ul className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10">
            {queue.map((entry) => (
              <JobQueueRow key={entry.key} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* Accepts the batch file's company_url as well as the API's companyUrl — one of the two
   always gets typed from memory. Validation mirrors what the server would reject. */
function toRow(raw, index) {
  const jd = typeof raw?.jd === "string" ? raw.jd : "";
  const companyUrl = String(raw?.company_url ?? raw?.companyUrl ?? "").trim();
  const days = raw?.days;
  const label = String(raw?.id ?? "").trim() || companyUrl || `Case ${index + 1}`;
  const key = `${label}-${index}`;

  if (!jd.trim()) return { key, label, error: "no jd" };

  const url = normalizeCompanyUrl(companyUrl);
  if (!url.ok) return { key, label, error: "bad url" };

  const daysError = checkDays(days);
  if (daysError) return { key, label, error: "bad days" };

  return { key, label, jd, companyUrl, days: Number(days) };
}
