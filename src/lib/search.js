import { search, SafeSearchType } from 'duck-duck-scrape';

import { readCache, writeCache } from '../models/FetchCache.js';

/**
 * Public-discussion search over DuckDuckGo — no API key, no free-tier ceiling.
 *
 * Finding nothing is a valid, honestly-reported outcome rather than an error: plenty
 * of companies have no public discussion of how they interview, and inventing some
 * would be worse than saying so (prd §3.2).
 */

const MAX_RESULTS = 6;

function queriesFor(company) {
  return [
    `${company} interview process`,
    `${company} interview questions engineering`,
  ];
}

export async function searchPublicDiscussion(company) {
  const name = String(company ?? '').trim();
  if (!name) return { results: [], queries: [] };

  const key = `search:${name.toLowerCase()}`;
  const cached = await readCache(key);
  if (cached) return cached;

  const queries = queriesFor(name);
  const seen = new Set();
  const results = [];

  for (const query of queries) {
    try {
      const response = await search(query, { safeSearch: SafeSearchType.MODERATE });
      for (const hit of response.results ?? []) {
        if (seen.has(hit.url) || results.length >= MAX_RESULTS) continue;
        seen.add(hit.url);
        results.push({
          title: hit.title,
          url: hit.url,
          snippet: (hit.description ?? '').replace(/<[^>]+>/g, '').slice(0, 400),
        });
      }
    } catch {
      // A failed query is a skipped source, not a failed run. If every query fails we
      // simply return nothing found, which the pipeline already handles.
    }
  }

  const payload = { results, queries };
  await writeCache(key, 'search', payload);
  return payload;
}
