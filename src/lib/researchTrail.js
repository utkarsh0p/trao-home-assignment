/**
 * The backstop behind the live activity list: page rows recovered from finished state.
 *
 * This used to be the whole progress screen, derived rather than instrumented. Derivation
 * turned out to have a ceiling — accumulated state can only describe work that has
 * finished, so nothing could ever show as in flight, and the search row went straight from
 * absent to an outcome. The nodes now report themselves (src/lib/activity.js), and this
 * runs once at the end of a run, merged `fillOnly`, to recover anything they missed:
 * `rankedPages` is what the crawl decided was worth reading, `pagesFetched` is what it
 * actually read, and `errors` carries the failures with the URL embedded in the step name
 * (`fetch_pages:<url>`). A report always wins over what is derived here.
 *
 * The search row is deliberately gone: a search has three outcomes and state can only
 * distinguish two of them, which is the whole reason it once claimed "nothing usable
 * found" for a search that had never run.
 */

import { pageLabel } from './activity.js';

/** Errors name their source as `fetch_pages:<url>`; everything else has no URL in it. */
function urlFromStep(step) {
  const at = String(step ?? '').indexOf(':');
  if (at === -1) return null;
  const rest = String(step).slice(at + 1);
  return /^https?:\/\//i.test(rest) ? rest : null;
}

/** Shortened for display: the origin is the same on every row and just costs width. */
export function displayUrl(url) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, '');
    return `${parsed.host}${path}` || parsed.host;
  } catch {
    return String(url ?? '');
  }
}

/**
 * @param {object} state  the accumulated graph state
 * @returns {Array<{ id, node, kind, url, label, status, detail }>}
 *
 * Ids match the ones the nodes emit, so a derived row and a reported row for the same
 * page are the same row rather than two.
 */
export function deriveTrail(state) {
  const trail = [];
  const seen = new Set();

  const push = (entry) => {
    if (!entry.url || seen.has(entry.url)) return;
    seen.add(entry.url);
    trail.push({ id: `page:${entry.url}`, ...entry });
  };

  // Pages that failed, keyed by URL, so a ranked page known to have failed is never
  // rendered as merely queued.
  const failures = new Map();
  for (const error of state.errors ?? []) {
    const url = urlFromStep(error.step);
    if (url) failures.set(url, error.code ?? 'FETCH_FAILED');
  }

  // Read, in the order they were read.
  for (const page of state.pagesFetched ?? []) {
    push({
      node: 'fetch_pages',
      kind: 'page',
      url: page.url,
      label: pageLabel(page.role),
      status: 'ok',
      detail: page.title ? String(page.title).slice(0, 80) : '',
    });
  }

  // Chosen but not read — either they failed, or they are still to come.
  for (const page of state.rankedPages ?? []) {
    push({
      node: 'rank_links',
      kind: 'page',
      url: page.url,
      label: pageLabel(page.role),
      status: failures.has(page.url) ? 'failed' : 'queued',
      detail: failures.get(page.url) ?? '',
    });
  }

  // Anything that failed without ever being ranked — the homepage itself, typically.
  for (const [url, code] of failures) {
    push({ node: 'fetch_pages', kind: 'page', url, label: pageLabel('other'), status: 'failed', detail: code });
  }

  return trail;
}

export default deriveTrail;
