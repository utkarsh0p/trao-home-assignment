/**
 * robots.txt compliance for the crawler (prd §3.2, "respect robots.txt and site terms").
 *
 * Fetched once per origin and cached for the life of the process: a two-level crawl hits
 * a handful of pages on one site, so re-reading the policy per page would cost more
 * requests than the crawl itself.
 *
 * Every failure mode resolves to "allowed". A site with no robots.txt, an unreachable
 * one, or an unparseable one has not told us to stay out, and refusing to read a public
 * careers page because its robots.txt 500'd would be the wrong call.
 */

const USER_AGENT_TOKEN = 'aiinterviewprepkit';
const ROBOTS_TIMEOUT_MS = 5000;
const MAX_ROBOTS_BYTES = 512 * 1024;

/** origin -> { allow: string[], disallow: string[] }, resolved once. */
const cache = new Map();

/**
 * Parses the subset of the robots.txt grammar that actually governs us: the group
 * matching our token, else the `*` group. A group's rules accumulate across repeated
 * `User-agent` lines, which is how most real files are written.
 */
export function parseRobots(text) {
  const wildcard = { allow: [], disallow: [] };
  const specific = { allow: [], disallow: [] };

  // Consecutive User-agent lines share one rule block.
  let targets = [];
  let expectingAgents = false;

  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!expectingAgents) targets = [];
      expectingAgents = true;

      const agent = value.toLowerCase();
      if (agent === '*') targets.push(wildcard);
      else if (USER_AGENT_TOKEN.includes(agent) || agent.includes(USER_AGENT_TOKEN)) {
        targets.push(specific);
      }
      continue;
    }

    expectingAgents = false;
    if (field !== 'allow' && field !== 'disallow') continue;
    // "Disallow:" with an empty value means "nothing is disallowed" — not a rule.
    if (field === 'disallow' && value === '') continue;

    for (const target of targets) target[field].push(value);
  }

  // A group naming us replaces the wildcard group entirely, per the standard.
  return specific.allow.length || specific.disallow.length ? specific : wildcard;
}

/** Converts a robots path pattern (with * and $) into an anchored matcher. */
function matches(pattern, pathname) {
  if (pattern === '') return false;

  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(pathname);
}

/**
 * Longest matching rule wins, and Allow beats Disallow at equal length — the
 * disambiguation every major crawler uses, and what lets `Allow: /careers` carve an
 * exception out of `Disallow: /`.
 */
export function isPathAllowed(rules, pathname) {
  const longest = (patterns) =>
    patterns.filter((pattern) => matches(pattern, pathname)).reduce((best, p) => Math.max(best, p.length), -1);

  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);

  if (disallow === -1) return true;
  return allow >= disallow;
}

async function loadRules(origin) {
  if (cache.has(origin)) return cache.get(origin);

  // Cache the in-flight promise, not just the result, so a parallel crawl of four pages
  // on one site issues one robots.txt request rather than four.
  const pending = (async () => {
    try {
      const response = await fetch(new URL('/robots.txt', origin), {
        redirect: 'follow',
        headers: { accept: 'text/plain' },
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      });

      // 404 is the common case and means "crawl freely". 5xx is ambiguous; we treat it
      // as permissive rather than letting one flaky file block all research.
      if (!response.ok) return { allow: [], disallow: [] };

      const text = (await response.text()).slice(0, MAX_ROBOTS_BYTES);
      return parseRobots(text);
    } catch {
      return { allow: [], disallow: [] };
    }
  })();

  cache.set(origin, pending);
  return pending;
}

/**
 * @param {URL|string} input
 * @returns {Promise<boolean>} false only when robots.txt explicitly disallows this path
 */
export async function isAllowedByRobots(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return true;
  }

  const rules = await loadRules(url.origin);
  return isPathAllowed(rules, `${url.pathname}${url.search}`);
}

/** Test seam — the cache is process-lifetime and would otherwise leak between cases. */
export function resetRobotsCache() {
  cache.clear();
}
