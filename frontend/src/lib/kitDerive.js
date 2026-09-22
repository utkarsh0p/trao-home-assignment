// Pure derivations over a kit document. No API calls, no React — everything here is a
// function of the kit the server last gave us.
//
// Several of these exist to compensate for things the API does not do:
//   * GET /api/kits/:id does not sort questions or flashcards by `order`.
//   * `order` is only unique within a category after a regeneration, never globally.
//   * kit.coverage is written by the pipeline and never updated again, so it goes stale
//     the moment anyone edits.

export const QUESTION_CATEGORIES = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
];

export const CATEGORY_LABELS = {
  technical: "Technical",
  behavioural: "Behavioural",
  "system-design": "System design",
  "company-fit": "Company fit",
};

/** Exactly the server's rule: the only items a regeneration may throw away. */
export function isReplaceable(item) {
  return item?.origin === "generated" && !item?.pinned;
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

/**
 * Group first, then sort within the group. Sorting the flat list would interleave
 * categories, because regeneration recomputes `order` per category — two questions in
 * different categories routinely share an order value.
 */
export function questionsByCategory(kit) {
  const groups = Object.fromEntries(QUESTION_CATEGORIES.map((c) => [c, []]));
  for (const question of kit?.questions ?? []) {
    (groups[question.category] ??= []).push(question);
  }
  for (const category of Object.keys(groups)) groups[category].sort(byOrder);
  return groups;
}

export function sortedFlashcards(kit) {
  return [...(kit?.flashcards ?? [])].sort(byOrder);
}

/**
 * Coverage as it stands right now, not as it stood when the kit was generated.
 * Mirrors the server's checkCoverage: union the requirement ids cited by questions,
 * intersected with requirements that actually exist.
 */
export function liveCoverage(kit) {
  const requirements = kit?.role?.requirements ?? [];
  const known = new Set(requirements.map((r) => r.id));

  const covered = new Set();
  for (const question of kit?.questions ?? []) {
    for (const id of question.requirement_ids ?? []) {
      if (known.has(id)) covered.add(id);
    }
  }

  const uncovered = requirements.filter((r) => !covered.has(r.id));
  return {
    covered,
    uncovered,
    uncoveredMust: uncovered.filter((r) => r.priority === "must"),
    coveredCount: covered.size,
    total: requirements.length,
  };
}

/** Each requirement with the questions that cover it — the weak-spots view. */
export function coverageByRequirement(kit) {
  const questions = kit?.questions ?? [];
  return (kit?.role?.requirements ?? []).map((requirement) => ({
    ...requirement,
    questions: questions.filter((q) => (q.requirement_ids ?? []).includes(requirement.id)),
  }));
}

/**
 * Days with their question ids resolved. Dangling ids are dropped rather than rendered
 * as blanks: regenerating the schedule replaces it wholesale, and nothing guarantees the
 * generator only referenced questions that still exist.
 */
export function resolveSchedule(kit) {
  const byId = new Map((kit?.questions ?? []).map((q) => [q.id, q]));
  const scheduled = new Set();

  const days = (kit?.schedule?.days ?? []).map((day) => {
    const questions = (day.question_ids ?? [])
      .map((id) => {
        const question = byId.get(id);
        if (question) scheduled.add(id);
        return question;
      })
      .filter(Boolean);
    return { ...day, questions, danglingCount: (day.question_ids ?? []).length - questions.length };
  });

  return {
    days,
    // Adding or regenerating questions never puts them in a day, so this is a state the
    // user reaches easily and should be told about.
    unscheduled: (kit?.questions ?? []).filter((q) => !scheduled.has(q.id)),
    totalMinutes: days.reduce((sum, day) => sum + (day.minutes ?? 0), 0),
  };
}

/**
 * What a regeneration actually did, by comparing the kit before and after.
 *
 * This has to be a diff: the job's terminal currentStep is always 'done' — finishJob
 * overwrites the "skipped" / "replaced N" message — so the server's own account of what
 * happened is unreadable by the time we see the job succeed.
 */
export function regenerationReport(before, after, section) {
  if (section === "company_brief" || section === "schedule") {
    const was = before?.[section];
    const now = after?.[section];
    const skipped = JSON.stringify(stripMeta(was)) === JSON.stringify(stripMeta(now));
    return {
      section,
      skipped,
      kept: skipped ? 1 : 0,
      replaced: skipped ? 0 : 1,
      added: 0,
      keptReason: skipped ? reasonFor(was) : null,
    };
  }

  const isFlashcards = section === "flashcards";
  const pick = (kit) =>
    isFlashcards
      ? (kit?.flashcards ?? [])
      : (kit?.questions ?? []).filter((q) => q.category === section);

  const was = pick(before);
  const now = pick(after);
  const beforeIds = new Set(was.map((item) => item.id));

  const survivors = was.filter((item) => !isReplaceable(item));
  const replaced = was.filter(isReplaceable);
  const added = now.filter((item) => !beforeIds.has(item.id));

  return {
    section,
    skipped: false,
    kept: survivors.length,
    keptBreakdown: {
      edited: survivors.filter((i) => i.origin === "edited").length,
      manual: survivors.filter((i) => i.origin === "manual").length,
      pinned: survivors.filter((i) => i.pinned).length,
    },
    replaced: replaced.length,
    added: added.length,
    addedIds: added.map((item) => item.id),
  };
}

function stripMeta(section) {
  if (!section) return null;
  const { origin, pinned, ...rest } = section;
  return rest;
}

function reasonFor(section) {
  if (section?.pinned) return "pinned";
  if (section?.origin === "edited") return "edited";
  if (section?.origin === "manual") return "written by hand";
  return null;
}
