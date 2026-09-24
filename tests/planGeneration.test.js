import assert from 'node:assert/strict';
import test from 'node:test';

import { planGeneration } from '../src/graph/nodes.js';

/**
 * Which question categories get asked, and why.
 *
 * The behaviour here was previously decided by three regexes — one for "designable"
 * requirement text, one for system-design language, one for junior/senior job titles.
 * They were wrong in both directions: "Software Developer Intern" matched the junior
 * pattern and hard-blocked system design, so a posting naming SQL and relational
 * databases got none, while a posting that said nothing designable could pick some up
 * purely from the company's hiring page.
 *
 * The judgement now belongs to the model that reads the posting: it tags each requirement
 * with the categories it can support, and names the seniority the posting states.
 * planGeneration does arithmetic over those tags, which is why these tests can stay pure
 * and deterministic — no network, no model call.
 */

const req = (id, text, supports = ['technical'], priority = 'must', kind = 'technical') => ({
  id,
  text,
  kind,
  priority,
  supports,
});

const backendReqs = [
  req('r1', 'Design and run our billing service', ['technical', 'system-design']),
  req('r2', 'Strong PostgreSQL', ['technical']),
  req('r3', 'Mentoring engineers', ['behavioural'], 'must', 'behavioural'),
];

const plan = (requirements, role = {}, research = {}) =>
  planGeneration({ requirements, research: { role, ...research } }).generationPlan;

test('a tagged requirement reaches its category on its own', () => {
  const p = plan([req('r1', 'Experience with distributed systems at scale', ['system-design'])]);
  assert.ok(p.buckets['system-design'].includes('r1'));
  assert.ok(p.counts['system-design'] > 0);
});

test('a requirement can support several categories at once', () => {
  const p = plan(backendReqs, { seniorityLevel: 'senior' });
  assert.ok(p.buckets.technical.includes('r1'), 'r1 is hands-on as well as designable');
  assert.ok(p.buckets['system-design'].includes('r1'));
});

test('an untagged requirement never reaches a category it does not support', () => {
  // The case that motivated the rewrite in the other direction: a real requirement that
  // supports no interview question at all.
  const p = plan([
    req('r1', 'Must know Python', ['technical']),
    req('r2', 'Available to commit for 3 months', []),
  ]);
  assert.equal(p.counts['system-design'], 0);
  assert.ok(!p.buckets.technical.includes('r2'), 'a laptop requirement is not a technical question');
});

test('the company hiring page alone cannot conjure ungrounded design questions', () => {
  // Research may add weight to a category the posting supports. It may not create one.
  const p = plan([req('r1', 'Must know Python', ['technical'])], { seniorityLevel: 'mid' }, {
    hiringCategories: ['system-design'],
  });

  assert.equal(
    p.counts['system-design'],
    0,
    'no requirement supports design, so the honest answer is none',
  );
});

test('an intern is not blocked from design when the posting genuinely calls for it', () => {
  // The defect from the screenshots: an internship naming relational databases got zero
  // design questions because "intern" matched a keyword, not because the posting was thin.
  const p = plan(
    [req('r1', 'Knowledge of SQL and relational databases', ['technical', 'system-design'])],
    { seniorityLevel: 'intern' },
  );
  assert.ok(p.junior, 'should still read as junior');
  assert.ok(p.counts['system-design'] > 0, 'the tag decides, not the job title');
});

test('research emphasis only raises a category the posting already supports', () => {
  const tagged = [req('r1', 'Design our ingestion pipeline', ['system-design'])];
  const bare = plan(tagged, { seniorityLevel: 'mid' });
  const emphasised = plan(tagged, { seniorityLevel: 'mid' }, { hiringCategories: ['system-design'] });

  assert.ok(emphasised.counts['system-design'] > bare.counts['system-design']);
});

test('public discussion counts as a research signal too', () => {
  const tagged = [req('r1', 'Collaborate across teams', ['behavioural'], 'must', 'behavioural')];
  const p = plan(tagged, {}, { publicDiscussion: { categories: ['behavioural'] } });
  assert.ok(p.emphasisesValues);
});

test('requirements saved before `supports` existed fall back to kind, not keywords', () => {
  const legacy = [
    { id: 'r1', text: 'Must know Python', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Mentoring engineers', kind: 'behavioural', priority: 'must' },
    { id: 'r3', text: 'Fintech background', kind: 'domain', priority: 'nice' },
  ];
  const p = plan(legacy);

  assert.deepEqual(p.buckets.technical, ['r1']);
  assert.deepEqual(p.buckets.behavioural, ['r2']);
  assert.ok(p.buckets['company-fit'].includes('r3'));
  assert.equal(p.counts['system-design'], 0, 'an old kit is never guessed into design');
});

test('a legacy kit still falls back after validation has defaulted supports to []', () => {
  // The subtle case: both the Zod and Mongoose schemas default `supports` to [], so an old
  // kit does not arrive here with the field absent — it arrives with it empty everywhere.
  // Reading absent-vs-empty per requirement would empty every bucket on such a kit.
  const roundTripped = [
    { id: 'r1', text: 'Must know Python', kind: 'technical', priority: 'must', supports: [] },
    { id: 'r2', text: 'Mentoring engineers', kind: 'behavioural', priority: 'must', supports: [] },
  ];
  const p = plan(roundTripped);

  assert.deepEqual(p.buckets.technical, ['r1'], 'an old kit must not lose its technical questions');
  assert.deepEqual(p.buckets.behavioural, ['r2']);
});

test('company fit is asked even when no requirement was tagged for it', () => {
  // Structural: you can always ask why this company. Not a rule about any posting's words.
  const p = plan([req('r1', 'Must know Python', ['technical'])]);
  assert.ok(p.buckets['company-fit'].length > 0);
});

test('categories are still generated separately, and empty ones stay empty', () => {
  const p = plan([req('r1', 'Must know Python', ['technical'])]);
  assert.equal(p.counts.behavioural, 0, 'no behavioural requirement, no behavioural questions');
  assert.ok(p.counts.technical > 0);
});

test('is deterministic', () => {
  const role = { seniorityLevel: 'staff' };
  assert.deepEqual(plan(backendReqs, role), plan(backendReqs, role));
});
