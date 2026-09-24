import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityId,
  emitActivity,
  mergeActivity,
  searchOutcome,
} from '../src/lib/activity.js';
import { searchDiscussion } from '../src/graph/nodes.js';
import { env } from '../src/lib/env.js';

/**
 * The live activity list. These tests pin the two properties the progress screen depends
 * on — a row updates in place, and a finished row stays finished — and the three search
 * outcomes, which the old derived trail collapsed into one false sentence.
 */

const row = (over = {}) => ({
  node: 'fetch_pages',
  kind: 'page',
  url: 'https://acme.test/careers',
  label: 'careers',
  status: 'queued',
  detail: '',
  ...over,
});

test('a row is identified by its URL, or by node and label when it has none', () => {
  assert.equal(
    activityId({ kind: 'page', node: 'fetch_pages', url: 'https://acme.test/' }),
    'page:https://acme.test/',
  );

  // Two nodes can both report "technical"; they are different rows.
  assert.notEqual(
    activityId({ kind: 'write', node: 'generate_questions_technical', label: 'technical' }),
    activityId({ kind: 'write', node: 'find_resources', label: 'technical' }),
  );
});

test('an emission resolves the row it started, in place', () => {
  const entries = [];
  mergeActivity(entries, emitActivity(null, row({ status: 'running' })));
  mergeActivity(entries, emitActivity(null, row({ node: 'rank_links', label: 'about', url: 'https://acme.test/about' })));
  mergeActivity(entries, emitActivity(null, row({ status: 'ok', detail: 'Careers' })));

  assert.equal(entries.length, 2, 'resolving a row must not append a second one');
  assert.equal(entries[0].status, 'ok', 'the started row is the one that resolved');
  assert.equal(entries[0].detail, 'Careers');
  assert.equal(entries[1].url, 'https://acme.test/about', 'order is first-seen order');
});

test('a finished row is never reopened', () => {
  const entries = [];
  mergeActivity(entries, emitActivity(null, row({ status: 'ok' })));

  // rank_links runs a second time after expand_hub and re-queues pages already read.
  mergeActivity(entries, emitActivity(null, row({ status: 'queued' })));
  assert.equal(entries[0].status, 'ok');

  // A genuine later failure of the same row is still allowed through.
  mergeActivity(entries, emitActivity(null, row({ status: 'failed', detail: 'GONE' })));
  assert.equal(entries[0].status, 'failed');
});

test('fillOnly adds what nobody reported and overwrites nothing', () => {
  const entries = [];
  mergeActivity(entries, emitActivity(null, row({ status: 'ok', detail: 'Careers' })));

  mergeActivity(entries, emitActivity(null, row({ status: 'queued', detail: '' })), {
    fillOnly: true,
  });
  assert.equal(entries[0].detail, 'Careers', 'the backstop must not overwrite a report');

  mergeActivity(entries, emitActivity(null, row({ url: 'https://acme.test/blog' })), {
    fillOnly: true,
  });
  assert.equal(entries.length, 2, 'a row nobody reported is still filled in');
});

test('the three search outcomes stay three', () => {
  const didNotLook = searchOutcome({ configured: false, failed: false, results: [] });
  const lookedAndEmpty = searchOutcome({ configured: true, failed: false, results: [] });
  const couldNotLook = searchOutcome({ configured: true, failed: true, results: [] });
  const found = searchOutcome({ configured: true, failed: false, results: [{}, {}] });

  // Three different facts about the kit. The old trail reported all three as
  // "nothing usable found", which is only true of one of them.
  const sentences = new Set([didNotLook.detail, lookedAndEmpty.detail, couldNotLook.detail]);
  assert.equal(sentences.size, 3);

  assert.equal(didNotLook.status, 'skipped', 'we chose not to look');
  assert.equal(couldNotLook.status, 'failed', 'we tried and could not');
  assert.equal(lookedAndEmpty.status, 'ok', 'we looked; the search itself worked');
  assert.match(lookedAndEmpty.detail, /nothing found/);
  assert.equal(found.detail, '2 sources');
  assert.equal(searchOutcome({ configured: true, results: [{}] }).detail, '1 source');
});

test('emitting without a writer is a no-op, so regeneration still runs', () => {
  // pipeline.service.js calls the question and synthesis nodes directly, with no config.
  assert.doesNotThrow(() => emitActivity(undefined, row()));
  assert.doesNotThrow(() => emitActivity({}, row()));

  const captured = [];
  emitActivity({ writer: (entry) => captured.push(entry) }, row({ status: 'running' }));
  assert.equal(captured.length, 1);
  assert.equal(captured[0].id, 'page:https://acme.test/careers');
});

test('the search row says it is searching before it says what it found', async () => {
  // The bug this whole module exists for: the row used to appear only once the search was
  // over, already carrying an outcome, so a search still in flight read "nothing usable
  // found" and flipped to "6 sources" seconds later.
  const captured = [];
  const config = { writer: (entry) => captured.push(entry) };

  const saved = env.tavilyApiKey;
  env.tavilyApiKey = '';
  let notes;
  try {
    ({ notes } = await searchDiscussion({ company: { name: 'Acme' } }, config));
  } finally {
    env.tavilyApiKey = saved;
  }

  assert.equal(captured.length, 2);
  assert.equal(captured[0].status, 'running', 'reported before the await, not after it');
  assert.equal(captured[0].id, captured[1].id, 'the same row resolves in place');

  // With no key this is "we did not look" — never "we looked and there is nothing".
  assert.equal(captured[1].status, 'skipped');
  assert.match(captured[1].detail, /no search provider configured/);
  assert.match(notes[0], /not evidence that none exists/i);
});

test('a node called without a graph still runs, and reports nothing', async () => {
  // Regeneration calls nodes directly, with no config and so no writer.
  const saved = env.tavilyApiKey;
  env.tavilyApiKey = '';
  try {
    const result = await searchDiscussion({ company: { name: 'Acme' } });
    assert.equal(result.research.publicDiscussion, null);
  } finally {
    env.tavilyApiKey = saved;
  }
});
