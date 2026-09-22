import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_COVERAGE_PASSES,
  checkCoverage,
  shouldRunAnotherPass,
} from '../src/services/coverage.service.js';

// Coverage gap detection and the second-pass loop.

const requirements = [
  { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Node', kind: 'technical', priority: 'must' },
  { id: 'r3', text: 'Mentoring', kind: 'behavioural', priority: 'nice' },
];

test('reports requirements that no question addresses', () => {
  const result = checkCoverage({
    requirements,
    questions: [{ id: 'q1', requirement_ids: ['r1'] }],
  });

  assert.deepEqual(result.uncovered_requirement_ids, ['r2', 'r3']);
  assert.deepEqual(result.uncoveredMustIds, ['r2'], 'must-haves are tracked separately');
});

test('reports nothing uncovered when every requirement has a question', () => {
  const result = checkCoverage({
    requirements,
    questions: [
      { id: 'q1', requirement_ids: ['r1', 'r2'] },
      { id: 'q2', requirement_ids: ['r3'] },
    ],
  });

  assert.deepEqual(result.uncovered_requirement_ids, []);
  assert.equal(shouldRunAnotherPass(result), false);
});

test('drops a question whose every citation is invented', () => {
  const result = checkCoverage({
    requirements,
    questions: [
      { id: 'q1', requirement_ids: ['r1'] },
      { id: 'q2', requirement_ids: ['r99', 'r42'] },
    ],
  });

  assert.deepEqual(result.droppedQuestionIds, ['q2']);
  assert.deepEqual(result.questions.map((q) => q.id), ['q1']);
});

test('prunes invented ids from a question that also cites a real one', () => {
  const result = checkCoverage({
    requirements,
    questions: [{ id: 'q1', requirement_ids: ['r1', 'r99'] }],
  });

  assert.deepEqual(result.droppedQuestionIds, []);
  assert.deepEqual(result.questions[0].requirement_ids, ['r1']);
});

test('an invented citation cannot count as coverage', () => {
  const result = checkCoverage({
    requirements,
    questions: [{ id: 'q1', requirement_ids: ['r99'] }],
  });

  assert.deepEqual(result.uncovered_requirement_ids, ['r1', 'r2', 'r3']);
});

test('a question citing nothing is kept but covers nothing', () => {
  const result = checkCoverage({
    requirements,
    questions: [{ id: 'q1', requirement_ids: [] }],
  });

  assert.deepEqual(result.questions.map((q) => q.id), ['q1']);
  assert.equal(result.uncovered_requirement_ids.length, 3);
});

test('counts passes across the loop', () => {
  const first = checkCoverage({ requirements, questions: [] });
  assert.equal(first.passes, 1);
  assert.equal(first.lastGapCount, null);

  const second = checkCoverage({
    requirements,
    questions: [{ id: 'q1', requirement_ids: ['r1'] }],
    previous: first,
  });
  assert.equal(second.passes, 2);
  assert.equal(second.lastGapCount, 3, 'sees the gap count it is being measured against');
});

test('loops again while gaps are still closing', () => {
  const first = checkCoverage({ requirements, questions: [] });
  assert.equal(shouldRunAnotherPass(first), true);

  const second = checkCoverage({
    requirements,
    questions: [{ id: 'q1', requirement_ids: ['r1'] }],
    previous: first,
  });
  assert.equal(shouldRunAnotherPass(second), true, '3 gaps became 2, so keep going');
});

test('breaks immediately when a pass closes nothing', () => {
  const first = checkCoverage({ requirements, questions: [] });
  const second = checkCoverage({ requirements, questions: [], previous: first });

  assert.equal(second.uncovered_requirement_ids.length, first.uncovered_requirement_ids.length);
  assert.equal(shouldRunAnotherPass(second), false, 'zero progress must break the loop');
});

test('stops at the pass cap even while still making progress', () => {
  const atCap = {
    uncovered_requirement_ids: ['r3'],
    passes: MAX_COVERAGE_PASSES,
    lastGapCount: 5,
  };
  assert.equal(shouldRunAnotherPass(atCap), false);
});
