import assert from 'node:assert/strict';
import test from 'node:test';

import { validateKit } from '../src/lib/kitSchema.js';

// Appendix A structure validation, incl. rejecting float minutes and question_ids
// pointing at questions that do not exist.

/** A minimal kit that satisfies every rule; each test breaks exactly one thing. */
function validKit(overrides = {}) {
  return {
    source: {
      company: 'Acme',
      company_url: 'https://acme.test/',
      role: 'Senior Backend Engineer',
      location: 'Remote',
      jd_chars: 1200,
      researched_at: '2026-09-01T09:12:44Z',
      pages_used: ['https://acme.test/about'],
    },
    company_brief: {
      summary: 'Acme builds widgets.',
      what_they_do: 'Widgets for the enterprise.',
      sources: ['https://acme.test/about'],
    },
    role: {
      title: 'Senior Backend Engineer',
      seniority: 'Senior',
      responsibilities: ['Build services'],
      requirements: [
        { id: 'r1', text: '5+ years with Node', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Describe the event loop.',
        answer_outline: 'Phases, microtasks, starvation.',
        difficulty: 2,
      },
    ],
    flashcards: [{ id: 'f1', front: 'Event loop', back: 'Phases', requirement_ids: ['r1'] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Technical depth', question_ids: ['q1'], minutes: 60 },
        { day: 2, focus: 'Review', question_ids: ['q1'], minutes: 30 },
      ],
    },
    coverage: { uncovered_requirement_ids: ['r2'], passes: 2 },
    ...overrides,
  };
}

const expectInvalid = (kit, fragment) => {
  const result = validateKit(kit);
  assert.equal(result.ok, false, 'expected the kit to be rejected');
  const combined = result.issues.map((issue) => `${issue.path} ${issue.message}`).join(' | ');
  assert.match(combined, fragment);
};

test('accepts a well-formed kit', () => {
  const result = validateKit(validKit());
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});

test('rejects float minutes', () => {
  const kit = validKit();
  kit.schedule.days[0].minutes = 62.5;
  expectInvalid(kit, /minutes|integer/i);
});

test('rejects a schedule that references a question which does not exist', () => {
  const kit = validKit();
  kit.schedule.days[0].question_ids = ['q99'];
  expectInvalid(kit, /unknown question "q99"/);
});

test('rejects a question citing a requirement that does not exist', () => {
  const kit = validKit();
  kit.questions[0].requirement_ids = ['r99'];
  expectInvalid(kit, /unknown requirement "r99"/);
});

test('rejects a flashcard citing a requirement that does not exist', () => {
  const kit = validKit();
  kit.flashcards[0].requirement_ids = ['r99'];
  expectInvalid(kit, /unknown requirement "r99"/);
});

test('rejects a schedule whose length disagrees with days_available', () => {
  const kit = validKit();
  kit.schedule.days_available = 5;
  expectInvalid(kit, /but days_available is 5/);
});

test('rejects days that are not numbered 1..n in order', () => {
  const kit = validKit();
  kit.schedule.days[1].day = 7;
  expectInvalid(kit, /Day numbers must run/);
});

test('rejects difficulty outside 1..3', () => {
  for (const difficulty of [0, 4, 2.5]) {
    const kit = validKit();
    kit.questions[0].difficulty = difficulty;
    expectInvalid(kit, /difficulty|integer|less than|greater than/i);
  }
});

test('rejects an unknown question category', () => {
  const kit = validKit();
  kit.questions[0].category = 'brainteaser';
  expectInvalid(kit, /category|invalid/i);
});

test('rejects an unknown requirement priority', () => {
  const kit = validKit();
  kit.role.requirements[0].priority = 'important';
  expectInvalid(kit, /priority|invalid/i);
});

test('rejects duplicate question ids', () => {
  const kit = validKit();
  kit.questions.push({ ...kit.questions[0] });
  expectInvalid(kit, /Duplicate id "q1"/);
});

test('rejects coverage naming a requirement that does not exist', () => {
  const kit = validKit();
  kit.coverage.uncovered_requirement_ids = ['r99'];
  expectInvalid(kit, /Coverage names unknown requirement "r99"/);
});

test('rejects a kit missing a top-level Appendix A key', () => {
  const kit = validKit();
  delete kit.coverage;
  expectInvalid(kit, /coverage/);
});

test('accepts an honest thin kit with no questions and nothing covered', () => {
  const kit = validKit({
    questions: [],
    flashcards: [],
    role: {
      title: 'Engineer',
      seniority: '',
      responsibilities: [],
      requirements: [{ id: 'r1', text: 'Node', kind: 'technical', priority: 'must' }],
    },
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: 'No material extracted to study', question_ids: [], minutes: 0 }],
    },
    coverage: { uncovered_requirement_ids: ['r1'], passes: 1 },
  });

  const result = validateKit(kit);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});

/* ------------------------------------------------ flashcard_ids (additive to App. A) */

test('a schedule day without flashcard_ids is still valid', () => {
  // The kits persisted before the field existed have days without it, and the fixture
  // above is one. `.default([])` is what keeps them loadable.
  const result = validateKit(validKit());
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.schedule.days[0].flashcard_ids, []);
});

test('accepts a day that schedules a flashcard which exists', () => {
  const kit = validKit();
  kit.schedule.days[0].flashcard_ids = ['f1'];
  assert.equal(validateKit(kit).ok, true);
});

test('rejects a schedule that references a flashcard which does not exist', () => {
  const kit = validKit();
  kit.schedule.days[0].flashcard_ids = ['f99'];
  expectInvalid(kit, /unknown flashcard "f99"/);
});

/* -------------------------------------------------- resources (additive to App. A) */

test('a kit without resources is still valid, and defaults to none', () => {
  // Same contract as flashcard_ids: every kit persisted before the field existed has to
  // keep loading, so the fixture above deliberately omits it.
  const result = validateKit(validKit());
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.resources, []);
  assert.deepEqual(result.data.schedule.days[0].resource_ids, []);
});

test('accepts a day that schedules a resource which exists', () => {
  const kit = validKit();
  kit.resources = [
    {
      id: 'res1',
      category: 'technical',
      kind: 'video',
      title: 'System design basics',
      url: 'https://www.youtube.com/watch?v=abc123',
      source: 'YouTube',
      thumbnail: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    },
  ];
  kit.schedule.days[0].resource_ids = ['res1'];
  assert.equal(validateKit(kit).ok, true);
});

test('rejects a schedule that references a resource which does not exist', () => {
  const kit = validKit();
  kit.schedule.days[0].resource_ids = ['res99'];
  expectInvalid(kit, /unknown resource "res99"/);
});

test('rejects two resources sharing an id', () => {
  const kit = validKit();
  const resource = {
    id: 'res1',
    category: 'technical',
    kind: 'article',
    title: 'Interviewing at scale',
    url: 'https://example.test/post',
    source: 'example.test',
    thumbnail: '',
  };
  kit.resources = [resource, { ...resource, title: 'Another' }];
  expectInvalid(kit, /Duplicate id "res1"/);
});
