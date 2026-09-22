import { AppError } from '../middleware/errorHandler.js';

/**
 * Deterministic day allocation. Arithmetic, never an LLM call. PRD §3.8.
 *
 * Guarantees, all of them checked in tests/schedule.test.js:
 *   - exactly `days` entries, numbered 1..days
 *   - every question placed at least once, so every must-have that has a question
 *     appears somewhere in the plan
 *   - harder and must-have material first
 *   - integer minutes, always
 */

const MINUTES_PER_QUESTION = 15;
const REVIEW_MINUTES_PER_QUESTION = 10;
const MIN_REVIEW_MINUTES = 30;

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
 * hardest few while it is still fresh; later ones sweep everything.
 */
function reviewSlice(ranked, sessionIndex) {
  if (ranked.length <= 2) return ranked;
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
 * @param {object[]} requirements
 * @param {object[]} questions
 * @param {number}   days  exactly how many days the plan must span
 */
export function buildSchedule({ requirements = [], questions = [], days }) {
  if (!Number.isInteger(days) || days < 1) {
    throw new AppError('VALIDATION_FAILED', 'days must be a positive integer.', 400);
  }

  const ranked = rankQuestions(questions, requirements);

  // More days than material: every question gets its own day up front, and the days
  // left over become review days that revisit earlier work. A day with nothing on it
  // would be a schedule that silently failed to allocate its time.
  const teachingDays = Math.min(days, ranked.length);
  const sizes = teachingDays > 0 ? bucketSizes(ranked.length, teachingDays) : [];

  // Which later days get a review session, and what each one covers.
  const reviewDays = ranked.length > 0 ? reviewDayNumbers(teachingDays, days) : [];
  const reviewPlan = new Map(
    reviewDays.map((day, index) => [day, reviewSlice(ranked, index)]),
  );

  const dayEntries = [];
  let cursor = 0;

  for (let i = 0; i < days; i += 1) {
    const dayNumber = i + 1;
    const size = sizes[i] ?? 0;
    const dayQuestions = ranked.slice(cursor, cursor + size);
    cursor += size;

    if (dayQuestions.length > 0) {
      dayEntries.push({
        day: dayNumber,
        focus: focusFor(dayQuestions),
        question_ids: dayQuestions.map((q) => q.id),
        minutes: dayQuestions.length * MINUTES_PER_QUESTION,
      });
      continue;
    }

    const session = reviewPlan.get(dayNumber);

    if (session) {
      dayEntries.push({
        day: dayNumber,
        focus: dayNumber === days ? 'Final run-through' : `Spaced review — ${focusFor(session)}`,
        question_ids: session.map((q) => q.id),
        minutes: Math.max(MIN_REVIEW_MINUTES, session.length * REVIEW_MINUTES_PER_QUESTION),
      });
      continue;
    }

    // A deliberate gap between review sessions, not an oversight. Saying "rest" plainly
    // is more useful than inventing a half-hour of busywork to fill the row.
    dayEntries.push({
      day: dayNumber,
      focus:
        ranked.length > 0
          ? 'Rest day — no scheduled material'
          : 'No material extracted to study',
      question_ids: [],
      minutes: 0,
    });
  }

  return { days_available: days, days: dayEntries };
}
