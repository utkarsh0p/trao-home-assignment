import { fetchPage } from './scraper.js';
import { isSameOrigin, normalizeUrl } from './urlGuard.js';

/**
 * Crawl a company site and collect the links worth ranking.
 *
 * The brief is explicit that a fixed list of paths is not sufficient: companies bury
 * hiring behind /careers, /jobs, a handbook, an engineering blog. So we harvest what
 * the site actually links to and let rank_links judge it, with one optional second
 * level when the first pass finds nothing convincing.
 */

const MAX_CANDIDATES = 60;

/** Fetches the seed page and harvests its same-origin links. */
export async function crawlSite(companyUrl) {
  const seedUrl = normalizeUrl(companyUrl);
  const page = await fetchPage(seedUrl.href);

  const candidates = page.links
    .filter((link) => isSameOrigin(link.url, seedUrl.origin))
    .map((link) => ({ ...link, depth: 1 }))
    .slice(0, MAX_CANDIDATES);

  return { seedPage: page, candidates, origin: seedUrl.origin };
}

/**
 * Harvests links from one promising hub page — the "/company" index that lists
 * /company/careers. Capped at a single expansion by the graph's `expansions` channel;
 * this is a two-level crawl, not a spider.
 */
export async function expandHub(hubUrl, origin, alreadySeen = new Set()) {
  const page = await fetchPage(hubUrl);

  const candidates = page.links
    .filter((link) => isSameOrigin(link.url, origin) && !alreadySeen.has(link.url))
    .map((link) => ({ ...link, depth: 2 }))
    .slice(0, MAX_CANDIDATES);

  return { hubPage: page, candidates };
}
