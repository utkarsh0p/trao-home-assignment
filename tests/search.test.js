import assert from 'node:assert/strict';
import test from 'node:test';

import { activeProvider, searchPublicDiscussion } from '../src/lib/search.js';
import { searchDiscussion } from '../src/graph/nodes.js';
import { env } from '../src/lib/env.js';

/**
 * The search backend is a capability, not a hardcoded dependency. What is pinned here is
 * the behaviour `npm run evaluate` depends on: with no provider configured the search
 * costs nothing and reports itself honestly.
 *
 * These tests make no network calls.
 *
 * `withNoProvider` blanks the one field `isConfigured()` reads, rather than skipping when
 * a key happens to be present. Guarding on the environment meant these stopped running
 * the moment a developer added a key — and the assertion they carry, that a missing
 * provider costs nothing, is exactly the one that must not rot unnoticed.
 */

async function withNoProvider(run) {
  const saved = env.tavilyApiKey;
  env.tavilyApiKey = '';
  try {
    return await run();
  } finally {
    env.tavilyApiKey = saved;
  }
}

test('with no provider configured, the search is an instant no-op', async () => {
  const { result, ms } = await withNoProvider(async () => {
    const started = process.hrtime.bigint();
    const value = await searchPublicDiscussion('Anthropic');
    return { result: value, ms: Number(process.hrtime.bigint() - started) / 1e6 };
  });

  assert.equal(result.configured, false, 'should report that no provider is set up');
  assert.equal(result.failed, false, 'nothing failed — we simply did not look');
  assert.deepEqual(result.results, []);
  assert.equal(result.provider, null);

  // The property that protects the batch: five cases must finish inside fifteen minutes,
  // and the DuckDuckGo scraper this replaced spent 224s per case discovering it was
  // blocked. Anything that reaches the network cannot hit this bound.
  assert.ok(ms < 50, `expected an immediate return, took ${ms.toFixed(1)}ms`);
});

test('a kit built without a provider says so, rather than claiming nothing exists', async () => {
  const { notes, errors, research } = await withNoProvider(() =>
    searchDiscussion({ company: { name: 'Acme' } }),
  );

  assert.equal(research.publicDiscussion, null);
  assert.equal(errors, undefined, 'a missing provider is not a research error');
  assert.equal(notes.length, 1);

  // The distinction the whole module exists to preserve: "we did not look" must never be
  // reported as "there is nothing to find".
  assert.match(notes[0], /no web search provider is configured/i);
  assert.match(notes[0], /not evidence that none exists/i);
  assert.doesNotMatch(notes[0], /was found/i);
});

test('a configured provider is discovered from the registry, not hardcoded', () => {
  const saved = env.tavilyApiKey;
  try {
    env.tavilyApiKey = '';
    assert.equal(activeProvider(), null, 'no key means no provider');
    env.tavilyApiKey = 'test-key';
    assert.equal(activeProvider()?.name, 'tavily', 'a key makes the provider active');
  } finally {
    env.tavilyApiKey = saved;
  }
});

test('a company with no name never reaches a provider', async () => {
  const result = await withNoProvider(() => searchPublicDiscussion('   '));
  assert.deepEqual(result.results, []);
  assert.equal(result.failed, false);
});

test('the default request body is unchanged by the options resources needs', async (t) => {
  const savedKey = env.tavilyApiKey;
  const savedFetch = globalThis.fetch;
  env.tavilyApiKey = 'pretend-key';

  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ results: [] }) };
  };
  t.after(() => {
    env.tavilyApiKey = savedKey;
    globalThis.fetch = savedFetch;
  });

  await activeProvider().search('anything');

  // Domain filters are omitted rather than sent empty, so adding them for the resource
  // search cannot quietly change the results this search has always returned.
  assert.deepEqual(bodies[0], { query: 'anything', max_results: 6, search_depth: 'basic' });
});
