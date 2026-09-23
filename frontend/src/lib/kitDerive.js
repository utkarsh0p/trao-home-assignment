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

/** Mirrors MINUTES_PER_QUESTION in src/services/schedule.service.js. */
const MINUTES_PER_QUESTION = 15;

/**
 * Days with their question ids resolved. Dangling ids are dropped rather than rendered
 * as blanks: regenerating the schedule replaces it wholesale, and nothing guarantees the
 * generator only referenced questions that still exist.
 *
 * Each day is also classified. The classification walks the days in order and tracks
 * which question ids have been seen, rather than matching on `focus` — `focus` is
 * generated copy ("Spaced review — Technical depth"), and copy must not become a
 * contract. A day that teaches something for the first time reads differently from the
 * fifth time the same card comes round, and a 60-day runway is mostly neither.
 */
export function resolveSchedule(kit) {
  const byId = new Map((kit?.questions ?? []).map((q) => [q.id, q]));
  const requirements = kit?.role?.requirements ?? [];
  const knownRequirements = new Map(requirements.map((r) => [r.id, r]));
  const scheduled = new Set();
  const seen = new Set();

  const raw = kit?.schedule?.days ?? [];
  const lastDayNumber = raw.length ? raw[raw.length - 1].day : 0;

  const days = raw.map((day) => {
    const questions = (day.question_ids ?? [])
      .map((id) => {
        const question = byId.get(id);
        if (question) scheduled.add(id);
        return question;
      })
      .filter(Boolean);

    const newQuestions = questions.filter((q) => !seen.has(q.id));
    const repeatQuestions = questions.filter((q) => seen.has(q.id));
    for (const question of questions) seen.add(question.id);

    const type = !questions.length
      ? "rest"
      : newQuestions.length
        ? "teaching"
        : day.day === lastDayNumber
          ? "final"
          : "review";

    // The requirements this day actually touches, as objects — "Kubernetes in
    // production" is what the user is revising; "r7" is what the JSON calls it.
    const dayRequirements = [];
    const taken = new Set();
    for (const question of questions) {
      for (const id of question.requirement_ids ?? []) {
        if (taken.has(id) || !knownRequirements.has(id)) continue;
        taken.add(id);
        dayRequirements.push(knownRequirements.get(id));
      }
    }
    dayRequirements.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "must" ? -1 : 1));

    return {
      ...day,
      questions,
      newQuestions,
      repeatQuestions,
      type,
      requirements: dayRequirements,
      danglingCount: (day.question_ids ?? []).length - questions.length,
      // `minutes` is written once by buildSchedule and never recomputed when a question
      // is deleted, so a day can read "45 min" over two questions. Only meaningful for
      // teaching days — review days are max(30, n * 10), not n * 15.
      minutesDrift:
        type === "teaching" && day.minutes !== questions.length * MINUTES_PER_QUESTION
          ? day.minutes - questions.length * MINUTES_PER_QUESTION
          : 0,
    };
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
 * The three properties the brief (§8) says a schedule must have, computed rather than
 * asserted. The panel used to claim "harder and higher-priority material lands earlier"
 * in prose and show nothing; these let it show the evidence instead — or say plainly
 * which property stopped holding after an edit.
 *
 * `mustUnscheduled` is deliberately NOT liveCoverage().uncoveredMust. That one means "a
 * must-have with no question at all" and belongs to the Role tab. This one means "a
 * must-have whose questions exist but sit in no day", which is reachable by deleting a
 * question or regenerating a category — kit.service prunes dead ids out of the days but
 * never re-runs buildSchedule.
 */
export function scheduleAudit(kit) {
  const { days, unscheduled } = resolveSchedule(kit);
  const requirements = kit?.role?.requirements ?? [];
  const mustIds = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));

  const scheduledIds = new Set(days.flatMap((day) => day.questions.map((q) => q.id)));
  const scheduledMust = new Set();
  for (const question of kit?.questions ?? []) {
    if (!scheduledIds.has(question.id)) continue;
    for (const id of question.requirement_ids ?? []) {
      if (mustIds.has(id)) scheduledMust.add(id);
    }
  }

  // The server's own ranking key, recomputed: schedule.service.js rankQuestions sorts by
  // (isMust ? 100 : 0) + difficulty, descending. If the allocation held, that weight
  // never rises as you move down the teaching days.
  const weightOf = (question) =>
    ((question.requirement_ids ?? []).some((id) => mustIds.has(id)) ? 100 : 0) +
    (question.difficulty ?? 2);

  const teaching = days.filter((day) => day.type === "teaching" && day.newQuestions.length);
  let orderingHolds = true;
  let ceiling = Infinity;
  for (const day of teaching) {
    const weights = day.newQuestions.map(weightOf);
    if (Math.max(...weights) > ceiling) orderingHolds = false;
    ceiling = Math.min(...weights);
  }

  const counts = { teaching: 0, review: 0, final: 0, rest: 0 };
  for (const day of days) counts[day.type] += 1;

  return {
    counts,
    daysPlanned: days.length,
    daysRequested: kit?.schedule?.days_available ?? days.length,
    daysMatch: days.length === (kit?.schedule?.days_available ?? days.length),
    mustTotal: mustIds.size,
    mustUnscheduled: requirements.filter(
      (r) => r.priority === "must" && !scheduledMust.has(r.id),
    ),
    orderingHolds,
    // Only counts days that teach; a day emptied by deletion shows up here.
    minutesDrift: days.filter((day) => day.minutesDrift !== 0),
    dangling: days.filter((day) => day.danglingCount > 0),
    unscheduledCount: unscheduled.length,
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
