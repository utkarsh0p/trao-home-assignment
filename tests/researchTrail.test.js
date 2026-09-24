import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveTrail, displayUrl } from '../src/lib/researchTrail.js';

/**
 * The backstop behind the live activity list. The nodes report what they are doing while
 * they do it (tests/activity.test.js); this recovers page rows from the finished state
 * for anything that went unreported, and its ids have to match theirs or the same page
 * would appear twice.
 */

const state = {
  pagesFetched: [
    { url: 'https://acme.test/', role: 'home', title: 'Acme' },
    { url: 'https://acme.test/careers', role: 'hiring', title: 'Careers' },
  ],
  rankedPages: [
    { url: 'https://acme.test/careers', role: 'hiring' },
    { url: 'https://acme.test/blog', role: 'blog' },
    { url: 'https://acme.test/about', role: 'about' },
  ],
  errors: [{ step: 'fetch_pages:https://acme.test/blog', code: 'PAGE_NOT_FOUND' }],
  research: { publicDiscussionHits: [{ url: 'a' }, { url: 'b' }] },
};

test('a page that was read is marked read, once', () => {
  const trail = deriveTrail(state);
  const careers = trail.filter((e) => e.url === 'https://acme.test/careers');

  assert.equal(careers.length, 1, 'ranked and fetched is still one row');
  assert.equal(careers[0].status, 'ok');
  assert.equal(careers[0].label, 'careers');
});

test('a page that failed is named, with the reason, not silently dropped', () => {
  const blog = deriveTrail(state).find((e) => e.url === 'https://acme.test/blog');

  // The URL is recovered from the error's `fetch_pages:<url>` step name.
  assert.equal(blog.status, 'failed');
  assert.equal(blog.detail, 'PAGE_NOT_FOUND');
});

test('a page chosen but not yet read shows as queued', () => {
  const about = deriveTrail(state).find((e) => e.url === 'https://acme.test/about');
  assert.equal(about.status, 'queued', 'what is about to happen is worth showing too');
});

test('derived rows carry the ids the nodes emit, so neither appears twice', () => {
  const careers = deriveTrail(state).find((e) => e.url === 'https://acme.test/careers');
  assert.equal(careers.id, 'page:https://acme.test/careers');
  assert.equal(careers.node, 'fetch_pages');
});

test('the search is not derived here — state cannot tell its three outcomes apart', () => {
  // "we did not look", "we looked and there is nothing" and "we tried and could not" are
  // three facts, and accumulated state distinguishes two of them. search_discussion
  // reports its own row instead (src/lib/activity.js, searchOutcome).
  assert.equal(deriveTrail(state).some((e) => e.kind === 'search'), false);
});

test('empty state is an empty trail, not a crash', () => {
  assert.deepEqual(deriveTrail({}), []);
});

test('urls are shortened for display but stay recognisable', () => {
  assert.equal(displayUrl('https://acme.test/careers/'), 'acme.test/careers');
  assert.equal(displayUrl('https://acme.test/'), 'acme.test');
  assert.equal(displayUrl('not a url'), 'not a url');
});
