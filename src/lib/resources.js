import { activeProvider } from './search.js';
import { readCache, writeCache } from '../models/FetchCache.js';
import { QUESTION_CATEGORIES } from './kitSchema.js';

/**
 * Curated things to watch and read, found by searching for the role.
 *
 * A prep kit that asks "walk me through how you would design this" and then leaves the
 * candidate to go and find something to study from is doing half the job. So for each
 * category the kit actually asks about, one search for a video and one for an article.
 *
 * Every field on a resource is either copied from a search result or derived from its
 * URL. Nothing here is written by a model and nothing is guessed — a hit whose video id
 * will not parse is dropped rather than linked, and a channel name we were not given is
 * simply absent. That is CLAUDE.md rule 4 made structural: there is no field an
 * invention could occupy.
 *
 * Searching for the ROLE, not the company, is what makes this cheap: two kits for two
 * different companies hiring the same role share every lookup.
 */

const MAX_PER_CATEGORY = 3;
const MAX_TOTAL = 10;
const VIDEO_RESULTS = 3;
const ARTICLE_RESULTS = 4;

/**
 * A nice-to-have must not spend the batch's time budget on retries. searchPublicDiscussion
 * retries twice because the kit's research depends on it; nothing here does.
 */
const RESOURCE_RETRIES = 0;

/** Whatever has settled when this expires is what the kit gets. */
export const RESOURCE_BUDGET_MS = 20000;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

/**
 * What to search for, per category. Shaped around the role because that is what the
 * candidate is preparing for — "Backend Engineer behavioural interview questions" is a
 * search that returns something useful; the company name is not.
 */
export function queryFor(role, category) {
  const name = String(role ?? '').trim();
  switch (category) {
    case 'technical':
      return `${name} technical interview prep`;
    case 'behavioural':
      return `${name} behavioural interview questions`;
    case 'system-design':
      return `${name} system design interview walkthrough`;
    case 'company-fit':
      return `${name} interview why this company answer`;
    default:
      return `${name} interview prep`;
  }
}

/**
 * The video id, or null if this is not a watchable video.
 *
 * A search restricted to youtube.com still returns channel pages, search result pages
 * and playlists. Linking one of those as "a video to watch" is a small lie, and there is
 * no thumbnail for it either, so anything without an id is dropped.
 */
export function youtubeVideoId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null;

  const id =
    parsed.hostname === 'youtu.be'
      ? parsed.pathname.slice(1)
      : parsed.searchParams.get('v') ??
        (parsed.pathname.startsWith('/shorts/') ? parsed.pathname.slice('/shorts/'.length) : '');

  const clean = String(id ?? '').split('/')[0];
  return /^[\w-]{6,}$/.test(clean) ? clean : null;
}

/** YouTube serves these without a key. hqdefault, because maxresdefault often 404s. */
export function thumbnailFor(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/** The article's publisher, as its address states it. Derived, never guessed. */
export function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A hit becomes a resource only if every field can be filled from the hit itself. */
function toResource(hit, { category, kind }) {
  const url = String(hit?.url ?? '').trim();
  const title = String(hit?.title ?? '').trim();
  if (!title || !url.startsWith('https://')) return null;

  if (kind === 'video') {
    const videoId = youtubeVideoId(url);
    if (!videoId) return null;
    return { category, kind, title, url, source: 'YouTube', thumbnail: thumbnailFor(videoId) };
  }

  // An article result that is really a video belongs in the video list or nowhere.
  if (youtubeVideoId(url)) return null;

  const source = hostLabel(url);
  if (!source) return null;
  return { category, kind, title, url, source, thumbnail: '' };
}

/** One category: the best video and the best articles we can stand behind. */
async function forCategory(provider, role, category) {
  const query = queryFor(role, category);
  const options = { retries: RESOURCE_RETRIES };

  const found = [];

  const videos = await provider
    .search(query, { ...options, maxResults: VIDEO_RESULTS, includeDomains: ['youtube.com'] })
    .catch(() => []);
  for (const hit of videos) {
    const resource = toResource(hit, { category, kind: 'video' });
    if (resource) {
      found.push(resource);
      break;
    }
  }

  const articles = await provider
    .search(query, { ...options, maxResults: ARTICLE_RESULTS, excludeDomains: ['youtube.com'] })
    .catch(() => []);
  for (const hit of articles) {
    if (found.length >= MAX_PER_CATEGORY) break;
    const resource = toResource(hit, { category, kind: 'article' });
    if (resource) found.push(resource);
  }

  return found;
}

/**
 * @param {string} role        the role title, from the posting
 * @param {string[]} categories  the categories this kit actually asks about
 * @returns {{ resources, configured, queries }}
 *
 * With no provider this returns immediately and touches no network — the same property
 * searchPublicDiscussion has, and the reason `npm run evaluate` is unaffected by this
 * feature existing.
 */
export async function searchResources(role, categories = QUESTION_CATEGORIES) {
  const name = String(role ?? '').trim();
  const wanted = categories.filter((category) => QUESTION_CATEGORIES.includes(category));
  const queries = wanted.map((category) => queryFor(name, category));

  const provider = activeProvider();
  if (!provider || !name || wanted.length === 0) {
    return { resources: [], configured: Boolean(provider), queries };
  }

  const key = `resources:${provider.name}:${name.toLowerCase()}:${wanted.join(',')}`;
  const cached = await readCache(key);
  if (cached) return { resources: cached.resources ?? [], configured: true, queries };

  // Categories run together, the two searches inside one run in order. Whatever has
  // settled when the budget expires is what the kit gets: this is the last thing in the
  // run worth waiting for.
  const settled = await Promise.race([
    Promise.allSettled(wanted.map((category) => forCategory(provider, name, category))),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), RESOURCE_BUDGET_MS);
      timer.unref?.();
    }),
  ]);

  const seen = new Set();
  const resources = [];
  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') continue;
    for (const resource of outcome.value) {
      if (resources.length >= MAX_TOTAL || seen.has(resource.url)) continue;
      seen.add(resource.url);
      // Ids are minted here, after filtering, so they stay dense — the same discipline
      // requirement and flashcard ids follow.
      resources.push({ id: `res${resources.length + 1}`, ...resource });
    }
  }

  if (resources.length > 0) await writeCache(key, 'resources', { resources });
  return { resources, configured: true, queries };
}
