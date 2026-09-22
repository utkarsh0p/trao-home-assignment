import * as cheerio from 'cheerio';

import { readCache, writeCache } from '../models/FetchCache.js';
import { isAllowedByRobots } from './robots.js';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_PAGE_BYTES,
  assertFetchable,
  looksLikePage,
  normalizeUrl,
} from './urlGuard.js';

/**
 * Fetch and clean one page: Cheerio first, Playwright only when the result looks
 * client-rendered (body text under ~200 chars).
 *
 * Escalating per page rather than per site is what protects the five-cases-in-fifteen-
 * minutes budget (.claude/tech-stack.md) — one JS-heavy careers page should not force a
 * browser launch for the whole crawl.
 */

const THIN_BODY_CHARS = 200;
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = 'AIInterviewPrepKit/1.0 (+research bot; respects robots.txt)';

const STRIP_SELECTORS = 'script, style, noscript, svg, iframe, nav, footer, header, form';

/** Turns HTML into the readable text a model can be grounded in. */
export function extractText(html) {
  const $ = cheerio.load(html);
  $(STRIP_SELECTORS).remove();

  const title = ($('title').first().text() || $('h1').first().text() || '').trim();

  // Block elements carry an implicit line break. Without restoring it, .text() runs
  // headings into paragraphs into list items and the model is grounded in mush.
  $('p, div, li, br, tr, section, article, h1, h2, h3, h4, h5, h6').after('\n');

  const body = $('main').length ? $('main') : $('body');

  const text = body
    .text()
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  return { title, text };
}

/** Same-origin, page-like links with their anchor text, for the crawler to rank. */
export function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $('a[href]').each((_i, element) => {
    const href = $(element).attr('href');
    if (!looksLikePage(href)) return;

    let resolved;
    try {
      // Relative links must work: batch fixtures are served from arbitrary hosts.
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }

    resolved.hash = '';
    const url = resolved.href;
    if (seen.has(url)) return;
    seen.add(url);

    links.push({ url, text: $(element).text().trim().slice(0, 120) });
  });

  return links;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.code = response.status === 404 ? 'PAGE_NOT_FOUND' : 'COMPANY_UNREACHABLE';
    throw error;
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    const error = new Error(`Unexpected content type ${contentType} for ${url}`);
    error.code = 'UNSUPPORTED_CONTENT_TYPE';
    throw error;
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_PAGE_BYTES) {
    const error = new Error(`Page too large: ${declaredLength} bytes`);
    error.code = 'PAGE_TOO_LARGE';
    throw error;
  }

  const html = await response.text();
  return html.slice(0, MAX_PAGE_BYTES);
}

/**
 * Loaded lazily so a deployment that never hits a client-rendered page never pays to
 * launch Chromium, and so a missing browser binary degrades to "thin page" rather than
 * taking down the run.
 */
async function renderWithPlaywright(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: FETCH_TIMEOUT_MS });
    await page.waitForTimeout(600);
    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * @returns {{ url, title, text, links, via: 'cache'|'cheerio'|'playwright' }}
 * @throws  an error carrying a stable `code` — callers record it in state and move on
 *          rather than failing the run (prd §3.2, "skip and report").
 */
export async function fetchPage(input, { useCache = true } = {}) {
  const url = await assertFetchable(normalizeUrl(input));
  const key = `page:${url.href}`;

  if (useCache) {
    const cached = await readCache(key);
    if (cached) return { ...cached, via: 'cache' };
  }

  // Checked before the request, not after: the point of robots.txt is not to send it.
  if (!(await isAllowedByRobots(url))) {
    const error = new Error(`robots.txt disallows ${url.pathname}`);
    error.code = 'ROBOTS_DISALLOWED';
    throw error;
  }

  const html = await fetchHtml(url.href);
  let { title, text } = extractText(html);
  let via = 'cheerio';

  // A near-empty body means the content is rendered client-side, not that the page
  // is empty. This is the only case worth a browser.
  if (text.length < THIN_BODY_CHARS) {
    try {
      const rendered = await renderWithPlaywright(url.href);
      const better = extractText(rendered);
      if (better.text.length > text.length) {
        title = better.title || title;
        text = better.text;
        via = 'playwright';
      }
    } catch {
      // No browser available, or it timed out: keep the thin Cheerio result and let
      // the caller report an honestly thin page.
    }
  }

  const page = { url: url.href, title, text, links: extractLinks(html, url.href) };
  if (useCache) await writeCache(key, 'page', page);
  return { ...page, via };
}
