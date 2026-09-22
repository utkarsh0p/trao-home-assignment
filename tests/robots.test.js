import assert from 'node:assert/strict';
import test from 'node:test';

import { isPathAllowed, parseRobots } from '../src/lib/robots.js';

// robots.txt is the one piece of crawl politeness the brief names explicitly, and its
// grammar has enough corners (longest-match, Allow-beats-Disallow, wildcards, group
// selection) that getting it subtly wrong would be invisible until a site complained.

const check = (text, path) => isPathAllowed(parseRobots(text), path);

test('no policy means nothing is forbidden', () => {
  assert.equal(check('', '/careers'), true);
  assert.equal(check('# just a comment', '/anything'), true);
});

test('an empty Disallow value is permission, not prohibition', () => {
  assert.equal(check('User-agent: *\nDisallow:', '/anything'), true);
});

test('a blanket disallow blocks everything', () => {
  const policy = 'User-agent: *\nDisallow: /';
  assert.equal(check(policy, '/'), false);
  assert.equal(check(policy, '/careers'), false);
});

test('only the named sections are blocked', () => {
  const policy = 'User-agent: *\nDisallow: /internal/\nDisallow: /admin';
  assert.equal(check(policy, '/careers'), true);
  assert.equal(check(policy, '/internal/hr'), false);
  assert.equal(check(policy, '/admin/users'), false);
});

test('Allow carves an exception out of a blanket block — longest match wins', () => {
  const policy = 'User-agent: *\nDisallow: /\nAllow: /careers';
  assert.equal(check(policy, '/careers'), true, 'the careers page is the one we most need');
  assert.equal(check(policy, '/careers/engineering'), true);
  assert.equal(check(policy, '/pricing'), false);
});

test('a group naming us replaces the wildcard group entirely', () => {
  const policy = ['User-agent: *', 'Disallow: /', '', 'User-agent: AIInterviewPrepKit', 'Disallow: /secret'].join('\n');
  assert.equal(check(policy, '/careers'), true, 'our own group governs, not the wildcard');
  assert.equal(check(policy, '/secret/plans'), false);
});

test('consecutive User-agent lines share one rule block', () => {
  const policy = ['User-agent: SomeBot', 'User-agent: *', 'Disallow: /private'].join('\n');
  assert.equal(check(policy, '/private'), false);
  assert.equal(check(policy, '/public'), true);
});

test('wildcards and end-anchors are honoured', () => {
  const policy = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/private';
  assert.equal(check(policy, '/report.pdf'), false);
  assert.equal(check(policy, '/report.pdf?download=1'), true, '$ anchors the very end');
  assert.equal(check(policy, '/tmp/42/private/notes'), false);
  assert.equal(check(policy, '/about.html'), true);
});

test('comments and stray lines are ignored rather than fatal', () => {
  const policy = ['# policy', 'Sitemap: https://x.test/sitemap.xml', 'User-agent: *  # everyone', 'Disallow: /x  # nope', 'garbage without a colon'].join('\n');
  assert.equal(check(policy, '/x'), false);
  assert.equal(check(policy, '/y'), true);
});

test('rules for other bots do not apply to us', () => {
  const policy = 'User-agent: GPTBot\nDisallow: /';
  assert.equal(check(policy, '/careers'), true);
});
