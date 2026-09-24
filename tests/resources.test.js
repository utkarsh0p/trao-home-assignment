import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hostLabel,
  queryFor,
  searchResources,
  thumbnailFor,
  youtubeVideoId,
} from '../src/lib/resources.js';
import { env } from '../src/lib/env.js';

/**
 * Curated resources. Two things are pinned here: that nothing reaches the kit unless it
 * can be filled in entirely from a real search result, and that with no provider this
 * costs nothing — the property `npm run evaluate` depends on.
 *
 * These tests make no network calls.
 */

test('queries are shaped around the role, one per category', () => {
  assert.equal(queryFor('Backend Engineer', 'technical'), 'Backend Engineer technical interview prep');
  assert.match(queryFor('Backend Engineer', 'behavioural'), /behavioural interview questions$/);
  assert.match(queryFor('Backend Engineer', 'system-design'), /system design interview walkthrough$/);
  assert.match(queryFor('Backend Engineer', 'company-fit'), /why this company answer$/);
});

test('a watchable video is recognised in every form YouTube serves it', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('anything that is not a video is not offered as one', () => {
  // A search restricted to youtube.com still returns these, and calling a channel page
  // "a video to watch" is a small lie with no thumbnail behind it.
  assert.equal(youtubeVideoId('https://www.youtube.com/@somechannel'), null);
  assert.equal(youtubeVideoId('https://www.youtube.com/results?search_query=interview'), null);
  assert.equal(youtubeVideoId('https://example.test/watch?v=abc123'), null);
  assert.equal(youtubeVideoId('not a url'), null);
});

test('the thumbnail is derived from the id, with no second request and no key', () => {
  assert.equal(thumbnailFor('abc123'), 'https://img.youtube.com/vi/abc123/hqdefault.jpg');
});

test('an article names its publisher as its address states it', () => {
  assert.equal(hostLabel('https://www.interviewing.io/guides/x'), 'interviewing.io');
  assert.equal(hostLabel('nonsense'), '');
});

test('with no provider configured, finding resources is an instant no-op', async () => {
  const saved = env.tavilyApiKey;
  env.tavilyApiKey = '';

  try {
    const started = process.hrtime.bigint();
    const result = await searchResources('Backend Engineer', ['technical', 'behavioural']);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    assert.deepEqual(result.resources, []);
    assert.equal(result.configured, false, 'no provider means we did not look');
    assert.equal(result.queries.length, 2, 'the queries we would have run are still reported');

    // The twin of the budget pinned in tests/search.test.js. `npm run evaluate` runs
    // with an LLM key alone, and five cases have fifteen minutes between them; a
    // nice-to-have that reaches the network on that path would eat into it.
    assert.ok(ms < 50, `expected an immediate return, took ${ms.toFixed(1)}ms`);
  } finally {
    env.tavilyApiKey = saved;
  }
});

test('a role with no name never reaches a provider', async () => {
  const saved = env.tavilyApiKey;
  env.tavilyApiKey = 'pretend-key';

  try {
    const result = await searchResources('   ', ['technical']);
    assert.deepEqual(result.resources, []);
  } finally {
    env.tavilyApiKey = saved;
  }
});

test('only hits that can be filled in from the result itself reach the kit', async (t) => {
  const savedKey = env.tavilyApiKey;
  const savedFetch = globalThis.fetch;
  env.tavilyApiKey = 'pretend-key';

  // Stubbed at the HTTP boundary so the filtering, id minting and dedupe all run for
  // real. The first call in a category is the video search, the second the articles.
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const video = body.include_domains?.includes('youtube.com');
    return {
      ok: true,
      json: async () => ({
        results: video
          ? [
              { title: 'A channel', url: 'https://www.youtube.com/@channel', content: '' },
              { title: 'Real talk', url: 'https://www.youtube.com/watch?v=abc123xyz', content: '' },
            ]
          : [
              { title: 'Insecure', url: 'http://example.test/post', content: '' },
              { title: '', url: 'https://example.test/untitled', content: '' },
              { title: 'A good guide', url: 'https://interviewing.io/guides/x', content: '' },
            ],
      }),
    };
  };

  t.after(() => {
    env.tavilyApiKey = savedKey;
    globalThis.fetch = savedFetch;
  });

  const { resources } = await searchResources('Backend Engineer', ['technical']);

  assert.deepEqual(
    resources.map((r) => r.url),
    ['https://www.youtube.com/watch?v=abc123xyz', 'https://interviewing.io/guides/x'],
    'the channel page, the http link and the untitled hit are all dropped',
  );

  assert.deepEqual(resources.map((r) => r.id), ['res1', 'res2'], 'ids stay dense after filtering');
  assert.equal(resources[0].source, 'YouTube');
  assert.equal(resources[0].thumbnail, 'https://img.youtube.com/vi/abc123xyz/hqdefault.jpg');
  assert.equal(resources[1].source, 'interviewing.io', 'derived from the URL, never guessed');
  assert.equal(resources[1].thumbnail, '');

  assert.deepEqual(bodies[0].include_domains, ['youtube.com']);
  assert.deepEqual(bodies[1].exclude_domains, ['youtube.com']);
});
