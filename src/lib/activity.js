/**
 * The live activity list: what the pipeline is doing, reported as it happens.
 *
 * This replaces deriving the list from accumulated graph state (see researchTrail.js,
 * now a backstop). Derivation can only ever describe work that has finished, because a
 * LangGraph node's writes do not land until it returns — which is why the search row used
 * to appear already-failed and flip to "6 sources" seconds later. A node that reports
 * `running` before it starts awaiting can say "I am doing this now", and that is the
 * whole difference between a progress screen and a list of past events.
 *
 * The transport is LangGraph's own `custom` stream mode: `config.writer` is set per task
 * by the Pregel loop and pushes to the consumer immediately, before the node returns.
 *
 * This module imports nothing. It is pure data shaping, so it can be unit-tested without
 * a graph, a network or a database — and so that nothing here can ever reach an LLM.
 */

/** What the link ranker decided a page was, in words a candidate would use. */
const ROLE_LABEL = {
  home: 'homepage',
  hiring: 'careers',
  about: 'about',
  blog: 'blog',
  product: 'product',
  other: 'page',
};

/** The one vocabulary for page rows, shared by the nodes and the state-derived backstop. */
export function pageLabel(role) {
  return ROLE_LABEL[role] ?? ROLE_LABEL.other;
}

/** Statuses that describe finished work. A finished row is never reopened. */
const TERMINAL = new Set(['ok', 'skipped', 'failed']);

/**
 * The identity of a row, so a `running` emission and the `ok` that follows it are the
 * same row and update in place rather than stacking up.
 *
 * A URL is unique on its own — the same page fetched by two nodes is one row. Everything
 * else is scoped by the node that reported it, so `technical` written by the question
 * node and `technical` found by the resource node stay apart.
 */
export function activityId({ kind, node, url, label }) {
  return url ? `${kind}:${url}` : `${kind}:${node}:${label}`;
}

/**
 * Reports one activity to whoever is streaming the run.
 *
 * `config.writer` is undefined when a node is called directly rather than through the
 * graph — which is exactly what regeneration does (pipeline.service.js calls the question
 * and synthesis nodes with one argument). So this is a no-op there, with no branching at
 * the call site and nothing for a caller to remember.
 *
 * @param {object} config  the LangGraph config handed to the node as its 2nd argument
 * @param {{ node, kind, label, status, url?, detail? }} entry
 * @returns {object} the normalised entry, for tests and for chaining
 */
export function emitActivity(config, entry) {
  const normalised = {
    id: entry.id ?? activityId(entry),
    node: entry.node,
    kind: entry.kind,
    url: entry.url ?? '',
    label: entry.label,
    status: entry.status,
    detail: entry.detail ?? '',
  };
  config?.writer?.(normalised);
  return normalised;
}

/**
 * Folds one emission into the list the job is showing.
 *
 * Two rules, both of which exist because the graph is not linear:
 *
 * - Replacement is in place. `rank_links` queues five pages and `fetch_pages` resolves
 *   them one at a time; if a resolution appended instead of replacing, the list would
 *   reshuffle under the user's eyes on every poll.
 * - A terminal row is never reopened. `rank_links` runs a second time after `expand_hub`
 *   and re-queues pages that have already been read, which would otherwise turn a `✓`
 *   back into a `·`.
 *
 * @param {Array} entries        the accumulated list, mutated in place
 * @param {object} incoming
 * @param {{ fillOnly?: boolean }} options
 *   fillOnly: only append rows whose id is not present. Used once, at the end of a run,
 *   to let the state-derived backstop fill gaps without overwriting what nodes reported.
 * @returns {Array} entries
 */
export function mergeActivity(entries, incoming, { fillOnly = false } = {}) {
  if (!incoming?.id) return entries;

  const at = entries.findIndex((entry) => entry.id === incoming.id);
  if (at === -1) {
    entries.push(incoming);
    return entries;
  }

  if (fillOnly) return entries;
  if (TERMINAL.has(entries[at].status) && !TERMINAL.has(incoming.status)) return entries;

  entries[at] = incoming;
  return entries;
}

/**
 * The three search outcomes src/lib/search.js keeps apart, mapped onto a row.
 *
 * They must never collapse into one sentence (decisions.md): "we did not look", "we
 * looked and there is nothing there" and "we tried and could not" are three different
 * facts about the kit, and the old single `skipped` row asserted the second one in all
 * three cases. This function is the one place that mapping lives, so it can be pinned by
 * a test rather than left to whoever edits the node next.
 */
export function searchOutcome({ configured, failed, results }) {
  if (!configured) return { status: 'skipped', detail: 'no search provider configured' };
  if (failed) return { status: 'failed', detail: 'search unavailable' };

  const count = (results ?? []).length;
  if (count === 0) return { status: 'ok', detail: 'nothing found' };
  return { status: 'ok', detail: `${count} source${count === 1 ? '' : 's'}` };
}
