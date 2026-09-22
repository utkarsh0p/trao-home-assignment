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
 * The practice picture, mirroring the server's practiceSession stats
 * (src/services/kit.service.js). Computed here so recording a confidence — which answers
 * with a kit, not with stats — does not cost a second round trip.
 *
 * Returns requirement OBJECTS, not ids: "Kubernetes in production" is what the user is
 * behind on; "r7" is what the JSON calls it.
 */
export function practiceStats(kit) {
  const cards = kit?.flashcards ?? [];
  const requirements = kit?.role?.requirements ?? [];
  const known = new Map(requirements.map((r) => [r.id, r]));

  const seen = cards.filter((card) => card.confidence != null);
  const practised = new Set(
    seen.flatMap((card) => card.requirement_ids ?? []).filter((id) => known.has(id)),
  );

  return {
    total: cards.length,
    seen: seen.length,
    unseen: cards.length - seen.length,
    practised: [...practised].map((id) => known.get(id)),
    notPractised: requirements.filter((r) => !practised.has(r.id)),
    // The cards the next session will lead with, for the end-of-session summary.
    shaky: seen.filter((card) => (card.confidence ?? 5) <= 2),
  };
}

/**
 * What a regeneration is ABOUT to do, so the contract can be stated once — where the
 * decision is made — instead of as a badge on every item. Mirrors the server's rule:
 * only `origin === 'generated' && !pinned` may be thrown away.
 */
export function regenerationPreview(kit, section) {
  if (section === "company_brief" || section === "schedule") {
    const item = kit?.[section];
    return {
      single: true,
      safe: item ? !isReplaceable(item) : false,
      reason: item?.pinned
        ? "pinned"
        : item?.origin === "edited"
          ? "edited"
          : item?.origin === "manual"
            ? "written by hand"
            : null,
    };
  }

  const items =
    section === "flashcards"
      ? (kit?.flashcards ?? [])
      : (kit?.questions ?? []).filter((q) => q.category === section);

  const kept = items.filter((item) => !isReplaceable(item));

  return {
    single: false,
    willReplace: items.length - kept.length,
    kept: kept.length,
    keptEdited: kept.filter((i) => i.origin === "edited" && !i.pinned).length,
    keptManual: kept.filter((i) => i.origin === "manual" && !i.pinned).length,
    keptPinned: kept.filter((i) => i.pinned).length,
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
