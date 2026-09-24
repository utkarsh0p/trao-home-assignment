// Parses the multi-role upload. Pure — no React, no fetch — so the whole "is this file
// usable" question is answerable without rendering anything.
//
// The file is deliberately the SAME shape the batch CLI eats (Appendix B input):
//
//   [ { "id": "case-01", "jd": "...", "company_url": "https://...", "days": 5 } ]
//
// One format feeds both `npm run evaluate` and the interface, so a file written for one
// works in the other with no conversion. Leniency mirrors normalizeCases() in
// src/cli/evaluate.js: a `{ cases: [...] }` wrapper is accepted, and `companyUrl` is
// taken as a synonym for `company_url`.

import { checkDays, normalizeCompanyUrl } from "./validation";

/**
 * Ten is the cap (.claude/decisions.md). Each run is ~40s of model work against a free
 * tier, and `generationLimiter` allows 20 generations an hour per user — shared with
 * regeneration. A file of 50 would trip that limit halfway through and leave the user
 * with a half-built set and no clear account of which ones ran.
 */
export const MAX_CASES = 10;

/** Thrown for a file that cannot be read at all, as opposed to rows that are invalid. */
export class CaseFileError extends Error {
  constructor(message) {
    super(message);
    this.name = "CaseFileError";
  }
}

/**
 * @param {string} text  the uploaded file's contents
 * @returns {{ cases: object[], truncated: number }}
 *   `cases` carries one row per case, each with `error` set to a human-readable reason
 *   when that row is not runnable. Invalid rows are kept rather than dropped — showing
 *   someone that row 4 has no company URL beats silently building three kits.
 * @throws {CaseFileError} when the file is not JSON, or is not a list of cases
 */
export function parseCases(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new CaseFileError("That file is empty.");

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new CaseFileError(
      "That isn't valid JSON. Export the file again, or check for a trailing comma.",
    );
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.cases;
  if (!Array.isArray(list)) {
    throw new CaseFileError(
      'Expected a JSON array of cases, or an object with a "cases" array.',
    );
  }
  if (list.length === 0) throw new CaseFileError("That file has no cases in it.");

  const kept = list.slice(0, MAX_CASES);

  return {
    cases: kept.map((entry, index) => toCase(entry, index)),
    truncated: list.length - kept.length,
  };
}

/**
 * One row, validated with the same client-side checks the single-role form uses, so a
 * bad URL reads identically whether it was typed or uploaded.
 */
function toCase(entry, index) {
  const id = String(entry?.id ?? `case-${index + 1}`);
  const jd = typeof entry?.jd === "string" ? entry.jd : "";
  const rawUrl = entry?.company_url ?? entry?.companyUrl ?? "";
  const url = normalizeCompanyUrl(rawUrl);

  // The CLI clamps days because a grader's file should not fail over a typo. Here there
  // is a person watching who can fix it, so say what is wrong instead of guessing.
  const days = Number(entry?.days);
  const daysError = checkDays(days);

  return {
    // Ids in the file are free text and may repeat; the index is what stays unique.
    key: `${index}-${id}`,
    id,
    jd,
    companyUrl: url.ok ? url.url : String(rawUrl ?? ""),
    days,
    error: firstError({ jd, urlError: url.ok ? null : url.error, daysError }),
  };
}

function firstError({ jd, urlError, daysError }) {
  if (!jd.trim()) return "No job description on this row.";
  if (urlError) return urlError;
  if (daysError) return daysError;
  return null;
}

/** The example shown in the UI, and what the "download a sample" link writes. */
export const SAMPLE_FILE = `[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\\n\\nWe are looking for ...",
    "company_url": "https://example.com",
    "days": 5
  }
]
`;
