import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSchedule } from '../src/services/schedule.service.js';

// Schedule allocation: exact day count, every must-have present, harder first.

const requirements = [
  { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Scale distributed systems', kind: 'technical', priority: 'must' },
  { id: 'r3', text: 'Mentoring', kind: 'behavioural', priority: 'nice' },
  { id: 'r4', text: 'Fintech background', kind: 'domain', priority: 'nice' },
];

const questions = [
  { id: 'q1', requirement_ids: ['r3'], category: 'behavioural', difficulty: 1 },
  { id: 'q2', requirement_ids: ['r1'], category: 'technical', difficulty: 3 },
  { id: 'q3', requirement_ids: ['r2'], category: 'system-design', difficulty: 2 },
  { id: 'q4', requirement_ids: ['r4'], category: 'company-fit', difficulty: 2 },
  { id: 'q5', requirement_ids: ['r1'], category: 'technical', difficulty: 1 },
];

test('spans exactly the number of days requested', () => {
  for (const days of [1, 2, 5, 7, 30, 60]) {
    const schedule = buildSchedule({ requirements, questions, days });
    assert.equal(schedule.days_available, days);
    assert.equal(schedule.days.length, days, `expected ${days} day entries`);
    assert.deepEqual(
      schedule.days.map((day) => day.day),
      Array.from({ length: days }, (_, i) => i + 1),
      'days must be numbered 1..n in order',
    );
  }
});

test('places every question, so no material is silently dropped', () => {
  for (const days of [1, 3, 5]) {
    const schedule = buildSchedule({ requirements, questions, days });
    const scheduled = new Set(schedule.days.flatMap((day) => day.question_ids));
    for (const question of questions) {
      assert.ok(scheduled.has(question.id), `${question.id} missing from a ${days}-day plan`);
    }
  }
});

test('every must-have requirement is covered somewhere in the plan', () => {
  const schedule = buildSchedule({ requirements, questions, days: 4 });
  const scheduledIds = new Set(schedule.days.flatMap((day) => day.question_ids));

  const covered = new Set(
    questions.filter((q) => scheduledIds.has(q.id)).flatMap((q) => q.requirement_ids),
  );

  for (const requirement of requirements.filter((r) => r.priority === 'must')) {
    assert.ok(covered.has(requirement.id), `must-have ${requirement.id} never appears`);
  }
});

test('must-haves and harder questions come first', () => {
  const schedule = buildSchedule({ requirements, questions, days: 5 });
  const order = schedule.days.flatMap((day) => day.question_ids);

  const mustIds = new Set(['q2', 'q3', 'q5']); // those citing r1 / r2
  const lastMustIndex = Math.max(...[...mustIds].map((id) => order.indexOf(id)));
  const firstNiceIndex = Math.min(order.indexOf('q1'), order.indexOf('q4'));

  assert.ok(lastMustIndex < firstNiceIndex, 'every must-have should precede every nice-to-have');
  // Within the must-have band, difficulty 3 outranks difficulty 1.
  assert.ok(order.indexOf('q2') < order.indexOf('q5'), 'harder questions should come first');
});

test('durations are always whole minutes', () => {
  for (const days of [1, 3, 7, 60]) {
    for (const day of buildSchedule({ requirements, questions, days }).days) {
      assert.ok(Number.isInteger(day.minutes), `day ${day.day} has non-integer minutes`);
    }
  }
});

test('a one-day request puts everything on day one', () => {
  const schedule = buildSchedule({ requirements, questions, days: 1 });
  assert.equal(schedule.days.length, 1);
  assert.equal(schedule.days[0].question_ids.length, questions.length);
});

test('more days than material produces review days, never empty ones', () => {
  const schedule = buildSchedule({ requirements, questions, days: 12 });

  assert.equal(schedule.days.length, 12);
  for (const day of schedule.days) {
    assert.ok(day.focus.length > 0, `day ${day.day} has no focus`);
    assert.ok(day.question_ids.length > 0, `day ${day.day} is empty`);
  }
});

test('every day has a focus even with no questions at all', () => {
  const schedule = buildSchedule({ requirements: [], questions: [], days: 3 });
  assert.equal(schedule.days.length, 3);
  for (const day of schedule.days) {
    assert.ok(day.focus.length > 0);
    assert.equal(day.minutes, 0);
  }
});

test('rejects a day count that is not a positive integer', () => {
  for (const days of [0, -1, 2.5, 'five', null, undefined]) {
    assert.throws(() => buildSchedule({ requirements, questions, days }), /positive integer/);
  }
});

test('is deterministic — the same inputs always give the same plan', () => {
  const a = buildSchedule({ requirements, questions, days: 4 });
  const b = buildSchedule({ requirements, questions, days: 4 });
  assert.deepEqual(a, b);
});
