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
const REVIEW_MINUTES = 30;

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

  const dayEntries = [];
  let cursor = 0;

  for (let i = 0; i < days; i += 1) {
    const size = sizes[i] ?? 0;
    const dayQuestions = ranked.slice(cursor, cursor + size);
    cursor += size;

    if (dayQuestions.length > 0) {
      dayEntries.push({
        day: i + 1,
        focus: focusFor(dayQuestions),
        question_ids: dayQuestions.map((q) => q.id),
        minutes: dayQuestions.length * MINUTES_PER_QUESTION,
      });
      continue;
    }

    // Review day: cycle back through the ranked list so the time is used and the
    // hardest material gets seen more than once.
    const revisit = ranked.length > 0 ? [ranked[(i - teachingDays) % ranked.length].id] : [];
    dayEntries.push({
      day: i + 1,
      focus: revisit.length > 0 ? 'Review and consolidation' : 'No material extracted to study',
      question_ids: revisit,
      minutes: revisit.length > 0 ? REVIEW_MINUTES : 0,
    });
  }

  return { days_available: days, days: dayEntries };
}
