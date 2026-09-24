import pRetry, { AbortError } from 'p-retry';

import { readCache, writeCache } from '../models/FetchCache.js';
import { env } from './env.js';

/**
 * Web search. Two callers: "look for public discussion of that company's interview
 * process" (brief §2), and the curated resources in src/lib/resources.js.
 *
 * The search backend is a *capability*, not a hardcoded dependency. A provider declares
 * whether it is configured; the pipeline uses the first one that is, and carries on
 * honestly when none is. Nothing anywhere asks which command is running — a kit built
 * with no search provider is the same class of event as a company with no reachable
 * careers page, and is reported the same way.
 *
 * That matters for `npm run evaluate`, which must run from a clean clone with only an LLM
 * key (brief §9). It is not special-cased; it is simply an environment where this
 * capability is absent, and the search becomes a synchronous no-op.
 *
 * This replaced a DuckDuckGo scraper. DDG blocks programmatically — a duck CAPTCHA under
 * load — and a single blocked search cost 224s, which timed out three of six cases in a
 * batch that has fifteen minutes for five. The anti-bot workarounds it needed (browser
 * escalation, request pacing, a circuit breaker) are all gone with it.
 */

const MAX_RESULTS = 6;
const REQUEST_TIMEOUT_MS = 15000;

function queriesFor(company) {
  return [`${company} interview process`, `${company} interview questions engineering`];
}

/* ------------------------------------------------------------------- providers */

/**
 * The contract every provider implements:
 *   name         — part of the cache key, so switching providers cannot serve stale hits
 *   isConfigured — the single place configuration is consulted
 *   search       — (query, options) resolving to [{ title, url, snippet }], or throwing
 *
 * `options` is the provider-neutral subset a second provider could also honour:
 *   maxResults, includeDomains, excludeDomains, searchDepth, retries.
 * Its defaults are the values searchPublicDiscussion has always sent, so the request
 * body for that caller is byte-for-byte what it was.
 */

const tavily = {
  name: 'tavily',

  isConfigured: () => Boolean(env.tavilyApiKey),

  async search(query, options = {}) {
    const {
      maxResults = MAX_RESULTS,
      includeDomains = [],
      excludeDomains = [],
      searchDepth = 'basic',
      retries = 2,
    } = options;

    const requestBody = { query, max_results: maxResults, search_depth: searchDepth };
    // Omitted rather than sent empty, so the default request is unchanged.
    if (includeDomains.length > 0) requestBody.include_domains = includeDomains;
    if (excludeDomains.length > 0) requestBody.exclude_domains = excludeDomains;

    return pRetry(
      async () => {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.tavilyApiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          const error = new Error(
            `Tavily answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          );
          // A rejected key will be rejected just as firmly on the third attempt. Only
          // server-side faults are worth waiting out.
          if (response.status < 500) throw new AbortError(error);
          throw error;
        }

        const body = await response.json();

        return (body.results ?? []).map((hit) => ({
          title: String(hit.title ?? '').trim(),
          url: String(hit.url ?? '').trim(),
          snippet: String(hit.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
        }));
      },
      { retries, minTimeout: 1000, factor: 2, randomize: true },
    );
  },
};

const PROVIDERS = [tavily];

/** The provider this process will use, or null when none is configured. */
export function activeProvider() {
  return PROVIDERS.find((provider) => provider.isConfigured()) ?? null;
}

/* ---------------------------------------------------------------------- search */

/**
 * @returns {{ results, queries, provider, configured, failed, error }}
 *
 * Three outcomes the caller must keep apart, because they are three different sentences
 * in the finished kit:
 *   configured:false            we did not look
 *   results:[], failed:false    we looked, there is nothing
 *   failed:true                 we tried to look and could not
 */
export async function searchPublicDiscussion(company) {
  const name = String(company ?? '').trim();
  const queries = name ? queriesFor(name) : [];

  const provider = activeProvider();
  if (!provider) {
    // No network and no waiting. This is what keeps a run with no search key fast, and
    // it falls out of the design rather than being a case anyone had to remember.
    return { results: [], queries, provider: null, configured: false, failed: false, error: null };
  }

  const settled = (extra) => ({
    results: [],
    queries,
    provider: provider.name,
    configured: true,
    failed: false,
    error: null,
    ...extra,
  });

  if (!name) return settled({});

  const key = `search:${provider.name}:${name.toLowerCase()}`;
  const cached = await readCache(key);
  if (cached) return settled(cached);

  const seen = new Set();
  const results = [];
  const failures = [];

  for (const query of queries) {
    // A second query that can only add hits we would discard is a request not worth making.
    if (results.length >= MAX_RESULTS) break;

    try {
      for (const hit of await provider.search(query)) {
        if (!hit.url || seen.has(hit.url) || results.length >= MAX_RESULTS) continue;
        seen.add(hit.url);
        results.push(hit);
      }
    } catch (error) {
      // One query failing is survivable if another works; every query failing is a
      // failed search, and is reported as one.
      failures.push(String(error.message ?? error));
    }
  }

  if (results.length === 0 && failures.length > 0) {
    // Deliberately not cached: a failure is a fact about this minute, not about the
    // company, and caching it would make one bad minute last all day.
    return settled({ failed: true, error: failures[0] });
  }

  const payload = { results, queries };
  await writeCache(key, 'search', payload);
  return settled(payload);
}
