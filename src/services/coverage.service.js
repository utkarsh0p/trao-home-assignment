/**
 * Deterministic gap detection. PRD §3.4.
 *
 * Set logic, never a model call (CLAUDE.md rule 3). The coverage check is what forces
 * the second pass: after the first draft, any requirement with no question against it
 * comes back as a gap, the graph generates for exactly those ids, and we check again.
 */

export const MAX_COVERAGE_PASSES = 3;

/**
 * @param {object[]} requirements  [{ id, text, kind, priority }]
 * @param {object[]} questions     [{ id, requirement_ids, category, ... }]
 * @param {object|null} previous   the coverage result from the prior pass, or null
 */
export function checkCoverage({ requirements = [], questions = [], previous = null }) {
  const requirementIds = new Set(requirements.map((r) => r.id));

  const kept = [];
  const droppedQuestionIds = [];

  for (const question of questions) {
    const cited = question.requirement_ids ?? [];
    const known = cited.filter((id) => requirementIds.has(id));

    // A question that cited requirements and got every one of them wrong is a
    // hallucination against a requirement set we did not extract — drop it rather
    // than let it count as coverage. One that never cited anything is merely
    // uncoupled, not invented, so it stays.
    if (cited.length > 0 && known.length === 0) {
      droppedQuestionIds.push(question.id);
      continue;
    }

    kept.push(known.length === cited.length ? question : { ...question, requirement_ids: known });
  }

  const covered = new Set();
  for (const question of kept) {
    for (const id of question.requirement_ids ?? []) covered.add(id);
  }

  const uncovered = requirements.filter((r) => !covered.has(r.id));

  return {
    questions: kept,
    droppedQuestionIds,
    uncovered_requirement_ids: uncovered.map((r) => r.id),
    // Must-haves are what the kit is actually scored on, and what the gap pass
    // should reach for first.
    uncoveredMustIds: uncovered.filter((r) => r.priority === 'must').map((r) => r.id),
    passes: (previous?.passes ?? 0) + 1,
    // The gap count we are being measured against, so the loop can see progress.
    lastGapCount: previous ? previous.uncovered_requirement_ids.length : null,
  };
}

/**
 * The loop condition from .claude/graph.md: keep going while there are gaps, we are
 * under the pass cap, and the last pass actually closed some. Zero progress breaks
 * immediately — a requirement the model could not generate against on pass 2 will not
 * improve on pass 3, and the leftovers ship honestly in uncovered_requirement_ids.
 */
export function shouldRunAnotherPass(coverage, maxPasses = MAX_COVERAGE_PASSES) {
  if (!coverage || coverage.uncovered_requirement_ids.length === 0) return false;
  if (coverage.passes >= maxPasses) return false;
  if (coverage.lastGapCount === null) return true;
  return coverage.uncovered_requirement_ids.length < coverage.lastGapCount;
}

/** The Appendix A slice of a coverage result — the rest is internal to the loop. */
export function toCoverageField(coverage) {
  return {
    uncovered_requirement_ids: coverage?.uncovered_requirement_ids ?? [],
    passes: coverage?.passes ?? 0,
  };
}
