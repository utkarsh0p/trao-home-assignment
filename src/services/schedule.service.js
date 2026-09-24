import { AppError } from '../middleware/errorHandler.js';

/**
 * Deterministic day allocation. Arithmetic, never an LLM call. PRD §3.8.
 *
 * Guarantees, all of them checked in tests/schedule.test.js:
 *   - exactly `days` entries, numbered 1..days
 *   - every question and every flashcard placed at least once, so every must-have that
 *     has a question appears somewhere in the plan
 *   - harder and must-have material first
 *   - the final day is a full run-through of everything, never a slice
 *   - integer minutes, always
 */

/**
 * What a first pass at one question actually costs. A flat per-question figure was the
 * old model and it produced ten-day plans made of ten fifteen-minute days; difficulty is
 * already extracted, so spend it.
 */
const QUESTION_MINUTES = { 1: 10, 2: 15, 3: 25 };
const DEFAULT_QUESTION_MINUTES = 15;

/**
 * Bringing something back is cheaper than learning it, but it is not free — and it is
 * what makes a session a session. A day of nothing but new questions is a lecture.
 */
const RECALL_MINUTES = { 1: 4, 2: 6, 3: 9 };
const DEFAULT_RECALL_MINUTES = 6;

const FLASHCARD_MINUTES = 2;

/** Two links is an evening's worth. More reads as a reading list, which nobody opens. */
const MAX_RESOURCES_PER_DAY = 2;

/** Opening a session costs something before any question is answered. */
const WARM_UP_MINUTES = 5;

/**
 * The shape of a day someone will actually sit down for. `TARGET_SESSION_MINUTES` is
 * what we aim a teaching day at; `MIN_QUESTIONS_PER_TEACHING_DAY` is the floor that
 * stops a thin kit from being smeared one question at a time across a long runway.
 */
const TARGET_SESSION_MINUTES = 60;
const MIN_QUESTIONS_PER_TEACHING_DAY = 2;

/**
 * A session shorter than this is not worth opening the laptop for, so a thin day is
 * topped up with recall of earlier material — never with invented work. The ceiling
 * stops a top-up from running away; it never truncates honest first-pass cost.
 */
const MIN_SESSION_MINUTES = 45;
const MAX_SESSION_MINUTES = 90;

/**
 * How much of the runway teaches new material before the plan turns to review. Teaching
 * every day right up to the interview leaves no consolidation; teaching only on day one
 * leaves a fortnight of nothing.
 */
const TEACHING_SHARE = 0.6;

/**
 * Widening gaps after the teaching days end, in the spirit of spaced repetition: recall
 * is strengthened by being tested just as it starts to fade, not by being drilled daily.
 *
 * This matters because "60 days until the interview" with five questions of material is a
 * real input the brief names. Filling all 55 remaining days with identical half-hour
 * reviews technically allocates the time, but it is not a plan anyone would follow.
 */
const REVIEW_INTERVALS = [1, 3, 7, 14, 21, 30];
/** Once the widening gaps run out, keep a steady fortnightly touch so nothing rots. */
const REVIEW_CADENCE = 14;

const CATEGORY_FOCUS = {
  technical: 'Technical depth',
  behavioural: 'Behavioural stories',
  'system-design': 'System design',
  'company-fit': 'Company fit',
};

/** Exported so the frontend can price a day without re-declaring the constants. */
export function questionMinutes(question) {
  return QUESTION_MINUTES[question?.difficulty] ?? DEFAULT_QUESTION_MINUTES;
}

export function recallQuestionMinutes(question) {
  return RECALL_MINUTES[question?.difficulty] ?? DEFAULT_RECALL_MINUTES;
}

/**
 * The single source of truth for what a day costs. The frontend mirrors this to tell a
 * stored `minutes` from one that drifted after an edit, so it lives in one place and is
 * exported rather than re-derived from a day's shape.
 */
export function sessionMinutes({ fresh = [], recalled = [], flashcards = [] }) {
  if (fresh.length === 0 && recalled.length === 0 && flashcards.length === 0) return 0;
  return (
    WARM_UP_MINUTES +
    fresh.reduce((sum, q) => sum + questionMinutes(q), 0) +
    recalled.reduce((sum, q) => sum + recallQuestionMinutes(q), 0) +
    flashcards.length * FLASHCARD_MINUTES
  );
}

/**
 * Sorts hardest-and-most-important first. A must-have outranks any nice-to-have
 * regardless of difficulty, because shipping without a must-have covered is the one
 * failure the brief calls out; within a priority band, harder comes first.
 */
function rankQuestions(questions, requirements) {
  const mustIds = new Set(requirements.filter((r) => r.priority === 'must').map((r) => r.id));

  const weighted = questions.map((question, index) => {
    const isMust = (question.requirement_ids ?? []).some((id) => mustIds.has(id));
    return {
      question,
      index,
      weight: (isMust ? 100 : 0) + (question.difficulty ?? 2),
    };
  });

  // Ties break on original index so the allocation is stable and reproducible —
  // the same inputs must always produce the same schedule.
  weighted.sort((a, b) => b.weight - a.weight || a.index - b.index);
  return weighted.map((w) => w.question);
}

/** Splits n items across d buckets as evenly as possible, front-loading the remainder. */
function bucketSizes(total, buckets) {
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * How many days introduce new material.
 *
 * Three ceilings, and the tightest wins: the runway itself, the share of it we are
 * willing to spend teaching, and the number of days that can each hold a real session.
 * That last one is the fix for the ten-day plan made of one question a day — with eight
 * questions and a floor of two, at most four days teach, and the rest consolidate.
 */
function teachingDayCount(questionCount, days) {
  if (questionCount === 0) return 0;

  const byRunway = Math.max(1, Math.ceil(days * TEACHING_SHARE));
  const bySessionSize = Math.max(1, Math.ceil(questionCount / MIN_QUESTIONS_PER_TEACHING_DAY));
  // Whenever there is more than one day, the last one belongs to the run-through. A
  // two-day plan used to teach on both and never rehearse.
  const reserved = days >= 2 ? days - 1 : days;

  return Math.min(days, reserved, byRunway, bySessionSize, questionCount);
}

/**
 * Which of the days after teaching ends carry a review session.
 *
 * Always includes the final day: whatever else the plan does, the day before the
 * interview is a run-through.
 */
function reviewDayNumbers(teachingDays, days) {
  const chosen = new Set();
  let lastGap = 0;

  for (const gap of REVIEW_INTERVALS) {
    const day = teachingDays + gap;
    if (day > days) break;
    chosen.add(day);
    lastGap = gap;
  }

  for (let day = teachingDays + lastGap + REVIEW_CADENCE; day <= days; day += REVIEW_CADENCE) {
    chosen.add(day);
  }

  if (days > teachingDays) chosen.add(days);

  return [...chosen].sort((a, b) => a - b);
}

/**
 * How much material a given review session covers. Early sessions revisit only the
 * hardest few while it is still fresh; later ones sweep more.
 *
 * The final day is never a slice. It used to be — with exactly two review sessions the
 * last one fell on `ranked.slice(0, ceil(n/2))`, so the night before the interview
 * revisited half the material and the other half was never seen again after the day it
 * was taught. `isFinal` is what closes that.
 */
function reviewSlice(ranked, sessionIndex, isFinal) {
  if (isFinal || ranked.length <= 2) return ranked;
  if (sessionIndex === 0) return ranked.slice(0, 2);
  if (sessionIndex === 1) return ranked.slice(0, Math.ceil(ranked.length / 2));
  return ranked;
}

function focusFor(dayQuestions) {
  if (dayQuestions.length === 0) return 'Review and consolidation';

  const counts = new Map();
  for (const q of dayQuestions) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const labels = ordered.slice(0, 2).map(([category]) => CATEGORY_FOCUS[category] ?? category);
  return labels.join(' + ');
}

/**
 * Spreads flashcards over the teaching days, keeping a card with the questions that
 * share its requirements wherever possible — revising "Kubernetes" on the day the
 * Kubernetes question is taught beats meeting it a week later out of context.
 *
 * Cards are only ever placed on days that already teach something. A rest day must stay
 * a rest day: it claims no time, and the plan says so plainly rather than inventing
 * twenty minutes of drill to fill the row.
 */
function spreadFlashcards(flashcards, teachingGroups) {
  const placement = teachingGroups.map(() => []);
  if (teachingGroups.length === 0 || flashcards.length === 0) return placement;

  // Which requirements each teaching day touches.
  const dayRequirements = teachingGroups.map(
    (group) => new Set(group.flatMap((q) => q.requirement_ids ?? [])),
  );

  const leftovers = [];

  for (const card of flashcards) {
    const cardRequirements = card.requirement_ids ?? [];
    const match = cardRequirements.length
      ? dayRequirements.findIndex((requirements) =>
          cardRequirements.some((id) => requirements.has(id)),
        )
      : -1;

    if (match === -1) leftovers.push(card);
    else placement[match].push(card);
  }

  // Cards that match nothing still have to be studied. Give them to the lightest day so
  // far, so an unmatched pile does not all land on day one.
  for (const card of leftovers) {
    let lightest = 0;
    for (let i = 1; i < placement.length; i += 1) {
      if (placement[i].length < placement[lightest].length) lightest = i;
    }
    placement[lightest].push(card);
  }

  return placement;
}

/**
 * Places the curated videos and articles on the days that teach what they are about.
 *
 * Same shape as spreadFlashcards and for the same reason: a video on answering
 * behavioural questions belongs on the day the behavioural questions are taught, not
 * bolted to the front of the plan. Matching is by category rather than by requirement —
 * a resource is about a kind of interview, not about one line of the posting.
 *
 * Two per day at most, and nothing on a rest day. A rest day claims no time, and
 * offering homework on it would quietly take that back.
 *
 * This runs inside buildSchedule rather than beside it so that repair_kit, which rebuilds
 * the schedule from scratch, restores the placement instead of destroying it.
 */
function spreadResources(resources, teachingGroups) {
  const placement = teachingGroups.map(() => []);
  if (teachingGroups.length === 0 || resources.length === 0) return placement;

  const dayCategories = teachingGroups.map(
    (group) => new Set(group.map((question) => question.category)),
  );

  const leftovers = [];

  for (const resource of resources) {
    const match = dayCategories.findIndex(
      (categories, index) =>
        categories.has(resource.category) && placement[index].length < MAX_RESOURCES_PER_DAY,
    );

    if (match === -1) leftovers.push(resource);
    else placement[match].push(resource);
  }

  // A resource whose category nobody teaches is still worth someone's evening; give it
  // to the lightest day rather than dropping it. It stays visible under its category in
  // the Questions tab either way.
  for (const resource of leftovers) {
    let lightest = -1;
    for (let i = 0; i < placement.length; i += 1) {
      if (placement[i].length >= MAX_RESOURCES_PER_DAY) continue;
      if (lightest === -1 || placement[i].length < placement[lightest].length) lightest = i;
    }
    if (lightest === -1) break;
    placement[lightest].push(resource);
  }

  return placement;
}

/**
 * Tops a session up to the floor with recall of material already taught, walking a
 * rotating cursor so the same two questions are not the answer every time. Returns the
 * questions added; never adds anything already on the day, and never breaks the ceiling.
 */
function topUpWithRecall(session, pool, cursorRef, alreadyOn) {
  const added = [];
  if (pool.length === 0) return added;

  let minutes = session();
  for (let step = 0; step < pool.length && minutes < MIN_SESSION_MINUTES; step += 1) {
    const candidate = pool[cursorRef.value % pool.length];
    cursorRef.value += 1;

    if (alreadyOn.has(candidate.id)) continue;
    if (minutes + recallQuestionMinutes(candidate) > MAX_SESSION_MINUTES) continue;

    alreadyOn.add(candidate.id);
    added.push(candidate);
    minutes = session(added);
  }

  return added;
}

/**
 * @param {object[]} requirements
 * @param {object[]} questions
 * @param {object[]} flashcards
 * @param {object[]} resources  curated videos and articles, placed but never timed
 * @param {number}   days  exactly how many days the plan must span
 */
export function buildSchedule({
  requirements = [],
  questions = [],
  flashcards = [],
  resources = [],
  days,
}) {
  if (!Number.isInteger(days) || days < 1) {
    throw new AppError('VALIDATION_FAILED', 'days must be a positive integer.', 400);
  }

  const ranked = rankQuestions(questions, requirements);
  const cards = [...flashcards];

  const teachingDays = teachingDayCount(ranked.length, days);
  const sizes = teachingDays > 0 ? bucketSizes(ranked.length, teachingDays) : [];

  // Group the questions per teaching day up front, so flashcards can be matched against
  // what each day actually teaches.
  const teachingGroups = [];
  let cursor = 0;
  for (const size of sizes) {
    teachingGroups.push(ranked.slice(cursor, cursor + size));
    cursor += size;
  }
  const cardPlacement = spreadFlashcards(cards, teachingGroups);
  const resourcePlacement = spreadResources(resources, teachingGroups);

  const hasMaterial = ranked.length > 0 || cards.length > 0;
  const reviewDays = hasMaterial ? reviewDayNumbers(teachingDays, days) : [];
  const reviewPlan = new Map(
    reviewDays.map((day, index) => [
      day,
      {
        questions: reviewSlice(ranked, index, day === days),
        // The last day sweeps every card; earlier sessions drill the same proportion of
        // the deck as they do of the questions.
        flashcards: day === days ? cards : cards.slice(0, Math.ceil(cards.length / 2)),
      },
    ]),
  );

  const dayEntries = [];
  // Everything taught so far, in rank order — the pool a thin session draws on, and the
  // reason no question is ever taught once and then never seen again.
  const taught = [];
  const recallCursor = { value: 0 };

  for (let i = 0; i < days; i += 1) {
    const dayNumber = i + 1;
    const fresh = teachingGroups[i] ?? [];
    const dayCards = cardPlacement[i] ?? [];
    const dayResources = resourcePlacement[i] ?? [];

    if (fresh.length > 0) {
      const onDay = new Set(fresh.map((q) => q.id));

      // Yesterday's new questions, brought back while they are still fresh enough to
      // strengthen rather than relearn.
      const carry = (teachingGroups[i - 1] ?? []).filter((q) => !onDay.has(q.id));
      for (const q of carry) onDay.add(q.id);

      const price = (extra = []) =>
        sessionMinutes({ fresh, recalled: [...carry, ...extra], flashcards: dayCards });
      const topUp = topUpWithRecall(price, taught, recallCursor, onDay);
      const recalled = [...carry, ...topUp];

      dayEntries.push({
        day: dayNumber,
        focus: focusFor(fresh),
        question_ids: [...fresh, ...recalled].map((q) => q.id),
        flashcard_ids: dayCards.map((c) => c.id),
        // Deliberately absent from the minutes below: the estimate is of the work the
        // kit asks for, and a link is an offer rather than an assignment.
        resource_ids: dayResources.map((r) => r.id),
        minutes: sessionMinutes({ fresh, recalled, flashcards: dayCards }),
      });

      taught.push(...fresh);
      continue;
    }

    const session = reviewPlan.get(dayNumber);

    if (session && (session.questions.length > 0 || session.flashcards.length > 0)) {
      const base = session.questions;
      const onDay = new Set(base.map((q) => q.id));
      const price = (extra = []) =>
        sessionMinutes({ recalled: [...base, ...extra], flashcards: session.flashcards });
      // The final day is already everything; anything else earns its length.
      const topUp =
        dayNumber === days ? [] : topUpWithRecall(price, taught, recallCursor, onDay);
      const recalled = [...base, ...topUp];

      dayEntries.push({
        day: dayNumber,
        focus:
          dayNumber === days ? 'Final run-through' : `Spaced review — ${focusFor(recalled)}`,
        question_ids: recalled.map((q) => q.id),
        flashcard_ids: session.flashcards.map((c) => c.id),
        resource_ids: [],
        minutes: sessionMinutes({ recalled, flashcards: session.flashcards }),
      });
      continue;
    }

    // A deliberate gap between review sessions, not an oversight. Saying "rest" plainly
    // is more useful than inventing a half-hour of busywork to fill the row.
    dayEntries.push({
      day: dayNumber,
      focus: hasMaterial ? 'Rest day — no scheduled material' : 'No material extracted to study',
      question_ids: [],
      flashcard_ids: [],
      resource_ids: [],
      minutes: 0,
    });
  }

  return { days_available: days, days: dayEntries };
}
