import assert from 'node:assert/strict';
import test from 'node:test';

import { Kit } from '../src/models/Kit.js';
import { toAppendixA, validateKit } from '../src/lib/kitSchema.js';

/**
 * The export shape. Appendix A permits extension, and this app uses several — but what
 * `npm run evaluate` writes and what the export button downloads is the brief's exact
 * seven keys plus the two extensions that were deliberately kept (notes, flashcard_ids).
 *
 * Curated resources are the counterexample, by decision: they are kit content, they are
 * validated, they are persisted — and they do not appear here, so kits.json is identical
 * to what a run without the feature would have produced.
 *
 * Built as an unsaved document, so this needs no database.
 */

function kitDoc() {
  return new Kit({
    userId: '000000000000000000000001',
    source: { company: 'Acme', company_url: 'https://acme.test', role: 'Engineer', jd_chars: 900 },
    company_brief: { summary: 'A company.', what_they_do: 'Things.', sources: [] },
    role: {
      title: 'Engineer',
      seniority: 'Mid',
      seniority_level: 'mid',
      responsibilities: [],
      requirements: [{ id: 'r1', text: 'React', kind: 'technical', priority: 'must' }],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain reconciliation.',
        answer_outline: 'Diffing.',
        difficulty: 2,
      },
    ],
    flashcards: [{ id: 'f1', front: 'Reconciliation?', back: 'Diffing.', requirement_ids: ['r1'] }],
    resources: [
      {
        id: 'res1',
        category: 'technical',
        kind: 'video',
        title: 'React interview prep',
        url: 'https://www.youtube.com/watch?v=abc123xyz',
        source: 'YouTube',
        thumbnail: 'https://img.youtube.com/vi/abc123xyz/hqdefault.jpg',
      },
    ],
    schedule: {
      days_available: 1,
      days: [
        {
          day: 1,
          focus: 'React',
          question_ids: ['q1'],
          flashcard_ids: ['f1'],
          resource_ids: ['res1'],
          minutes: 30,
        },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  });
}

test('the exported kit has exactly the Appendix A keys', () => {
  assert.deepEqual(Object.keys(kitDoc().toAppendixA()).sort(), [
    'company_brief',
    'coverage',
    'flashcards',
    'notes',
    'questions',
    'role',
    'schedule',
    'source',
  ]);
});

test('resources are persisted and validated, but never exported', () => {
  const doc = kitDoc();

  // On the document, and structurally valid.
  assert.equal(doc.resources.length, 1);
  assert.equal(doc.schedule.days[0].resource_ids[0], 'res1');

  const exported = doc.toAppendixA();
  assert.equal('resources' in exported, false, 'kits.json stays the shape the brief names');
  assert.equal('resource_ids' in exported.schedule.days[0], false);

  // And what is exported is still a valid kit in its own right.
  assert.equal(validateKit(exported).ok, true);
});

test('the batch path and the persisted path project the same shape', () => {
  // `npm run evaluate` never touches Mongo, so it projects the pipeline's plain object
  // through toAppendixA() instead of the document method. The two must not drift: a
  // field kept out of one and not the other is a kit that changes shape depending on
  // how it was produced.
  const persisted = kitDoc().toAppendixA();
  const batch = toAppendixA({
    notes: [],
    source: {},
    company_brief: {},
    role: {},
    questions: [],
    flashcards: [],
    resources: [{ id: 'res1' }],
    schedule: { days_available: 1, days: [{ day: 1, resource_ids: ['res1'], minutes: 0 }] },
    coverage: {},
  });

  assert.deepEqual(Object.keys(batch).sort(), Object.keys(persisted).sort());
  assert.equal('resources' in batch, false);
  assert.equal('resource_ids' in batch.schedule.days[0], false);
});
