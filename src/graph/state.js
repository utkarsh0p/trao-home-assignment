import { Annotation } from '@langchain/langgraph';

/**
 * The graph state channel definitions shared across nodes (.claude/graph.md).
 *
 * `notes` and `errors` are how "skip and report" (prd §3.2) works: a node that fails a
 * source appends to them and returns normally. Nothing in the research phase throws,
 * because an unreachable careers page is a thin kit, not a failed run.
 */

const last = (initial) =>
  Annotation({ reducer: (_current, next) => next ?? _current, default: () => initial });

const concat = () =>
  Annotation({ reducer: (current, next) => [...current, ...(next ?? [])], default: () => [] });

/** Link candidates arrive from two crawl levels and overlap heavily. */
const concatUniqueByUrl = () =>
  Annotation({
    reducer: (current, next) => {
      const seen = new Set(current.map((item) => item.url));
      return [...current, ...(next ?? []).filter((item) => !seen.has(item.url) && seen.add(item.url))];
    },
    default: () => [],
  });

/** Questions arrive from four category branches plus the gap loop. */
const concatUniqueById = () =>
  Annotation({
    reducer: (current, next) => {
      const seen = new Set(current.map((item) => item.id));
      return [...current, ...(next ?? []).filter((item) => !seen.has(item.id) && seen.add(item.id))];
    },
    default: () => [],
  });

export const KitState = Annotation.Root({
  /** { jd, companyUrl, days, caseId } — read-only after prepare. */
  input: last({}),

  /** { name, normalizedUrl, origin, jdChars, dedupeHash } */
  company: last(null),

  linkCandidates: concatUniqueByUrl(),

  /** [{ url, role, confidence }] where role is about | hiring | blog | product */
  rankedPages: last([]),

  /** Drives the one-shot hub expansion: low confidence means keep looking. */
  hiringPageConfidence: last(0),
  bestHubUrl: last(null),

  pagesFetched: concat(),

  /** Guards the one-shot hub expansion. */
  expansions: Annotation({ reducer: (current, next) => current + (next ?? 0), default: () => 0 }),

  /**
   * How many of the three research branches have landed. LangGraph schedules a node
   * when ANY incoming channel updates, not all of them, so a fan-in whose parents sit
   * at different depths fires once per arrival. This counter lets `await_research`
   * hold the join until the slowest branch is in.
   */
  researchBranchesDone: Annotation({ reducer: (current, next) => current + (next ?? 0), default: () => 0 }),

  /** [{ id, text, kind, priority }] */
  requirements: last([]),

  /** { companyBrief, hiringProcess|null, publicDiscussion|null } */
  research: Annotation({
    reducer: (current, next) => ({ ...current, ...(next ?? {}) }),
    default: () => ({ companyBrief: null, hiringProcess: null, publicDiscussion: null }),
  }),

  /** Which categories to generate, and which requirements belong to each. */
  generationPlan: last(null),

  questions: concatUniqueById(),

  /**
   * `questions` is append-only because four category branches and the gap loop all
   * write to it, so nothing can be removed from it. check_coverage publishes its
   * cleaned list here instead, and build_schedule publishes the renumbered final list.
   */
  validQuestions: last([]),
  finalQuestions: last([]),

  flashcards: last([]),

  /** { uncovered_requirement_ids, passes, lastGapCount } */
  coverage: last(null),
  schedule: last(null),

  /** The assembled Appendix A object, once build_schedule has run. */
  kit: last(null),

  notes: concat(),
  errors: concat(),
});

export default KitState;
