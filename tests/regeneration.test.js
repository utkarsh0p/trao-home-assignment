import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeRegenerated, mintIds, orderForPractice } from '../src/services/kit.service.js';

/**
 * Regeneration must not discard work the user did by hand. The brief calls this "the
 * hardest state problem in the assessment" and it carries the largest human-review
 * line item, so it is tested here alongside the three areas the brief names.
 */

const existing = [
  { id: 'q1', prompt: 'machine wrote this', origin: 'generated', pinned: false, order: 1 },
  { id: 'q2', prompt: 'user fixed this', origin: 'edited', pinned: false, order: 2 },
  { id: 'q3', prompt: 'user wrote this', origin: 'manual', pinned: false, order: 3 },
  { id: 'q4', prompt: 'machine wrote, user pinned', origin: 'generated', pinned: true, order: 4 },
];

const fresh = [{ prompt: 'new one' }, { prompt: 'new two' }];

test('replaces only unpinned generated items', () => {
  const { items, replacedCount } = mergeRegenerated(existing, fresh, { prefix: 'q' });

  assert.equal(replacedCount, 1, 'only q1 was replaceable');
  assert.deepEqual(
    items.map((item) => item.prompt),
    ['user fixed this', 'user wrote this', 'machine wrote, user pinned', 'new one', 'new two'],
  );
});

test('an edited question survives a regeneration of its category', () => {
  const { items } = mergeRegenerated(existing, fresh, { prefix: 'q' });
  const edited = items.find((item) => item.id === 'q2');

  assert.ok(edited, 'the edited question is gone');
  assert.equal(edited.prompt, 'user fixed this');
  assert.equal(edited.origin, 'edited');
});

test('a pinned generated question survives', () => {
  const { items } = mergeRegenerated(existing, fresh, { prefix: 'q' });
  const pinned = items.find((item) => item.id === 'q4');

  assert.ok(pinned);
  assert.equal(pinned.prompt, 'machine wrote, user pinned');
});

test('a hand-written question survives', () => {
  const { items } = mergeRegenerated(existing, fresh, { prefix: 'q' });
  const manual = items.find((item) => item.id === 'q3');

  assert.ok(manual);
  assert.equal(manual.origin, 'manual');
});

test('new items never reuse an id that is still in the kit', () => {
  const { items } = mergeRegenerated(existing, fresh, { prefix: 'q' });
  const ids = items.map((item) => item.id);

  assert.equal(new Set(ids).size, ids.length, 'ids must stay unique');
  assert.ok(!ids.includes('q1'), 'the replaced id is not silently recycled');
  assert.deepEqual(ids.slice(-2), ['q5', 'q6']);
});

test('regenerated items are marked generated, so they can be replaced again', () => {
  const { items } = mergeRegenerated(existing, fresh, { prefix: 'q' });
  for (const item of items.slice(-2)) {
    assert.equal(item.origin, 'generated');
    assert.equal(item.pinned, false);
  }
});

test('regenerating twice in a row still keeps the user edits', () => {
  const first = mergeRegenerated(existing, fresh, { prefix: 'q' });
  const second = mergeRegenerated(first.items, [{ prompt: 'third pass' }], { prefix: 'q' });

  const prompts = second.items.map((item) => item.prompt);
  assert.ok(prompts.includes('user fixed this'));
  assert.ok(prompts.includes('user wrote this'));
  assert.ok(prompts.includes('machine wrote, user pinned'));
  assert.equal(second.replacedCount, 2, 'the two items from the first regeneration');
});

test('a kit with nothing but user content is left entirely alone', () => {
  const userOnly = existing.filter((item) => item.origin !== 'generated');
  const { items, replacedCount } = mergeRegenerated(userOnly, [], { prefix: 'q' });

  assert.equal(replacedCount, 0);
  assert.deepEqual(items.map((item) => item.id), ['q2', 'q3']);
});

test('mintIds continues past the highest existing number', () => {
  assert.deepEqual(mintIds('q', [{ id: 'q1' }, { id: 'q9' }, { id: 'q3' }], 2), ['q10', 'q11']);
  assert.deepEqual(mintIds('f', [], 1), ['f1']);
  assert.deepEqual(mintIds('q', [{ id: 'qg2_1' }], 1), ['q1'], 'unrelated prefixes are ignored');
});

test('practice ordering puts unseen cards first, then least confident', () => {
  const ordered = orderForPractice([
    { id: 'f1', confidence: 4, order: 1 },
    { id: 'f2', confidence: null, order: 2 },
    { id: 'f3', confidence: 1, order: 3 },
    { id: 'f4', confidence: null, order: 4 },
    { id: 'f5', confidence: 2, order: 5 },
  ]);

  assert.deepEqual(ordered.map((card) => card.id), ['f2', 'f4', 'f3', 'f5', 'f1']);
});
