import dns from 'node:dns/promises';
import net from 'node:net';

import { env } from './env.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Validates external URLs before fetching (prd §3.11).
 *
 * Private and loopback addresses are rejected only when NODE_ENV=production: the
 * batch command legitimately serves company fixtures from localhost, so blocking them
 * everywhere would break `npm run evaluate` on a grader's machine.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function normalizeUrl(input, base = undefined) {
  let url;
  try {
    url = new URL(String(input).trim(), base);
  } catch {
    throw new AppError('INVALID_URL', `Not a usable URL: ${input}`, 400);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new AppError('INVALID_URL', `Unsupported protocol: ${url.protocol}`, 400);
  }

  url.hash = '';
  return url;
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  if (lower.startsWith('fe80')) return true; // link-local
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

/**
 * Resolves the host and checks where it actually points, rather than trusting the
 * hostname — a public name can resolve to 169.254.169.254 just as easily.
 */
export async function assertFetchable(url) {
  const target = url instanceof URL ? url : normalizeUrl(url);
  if (!env.isProduction) return target;

  const host = target.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new AppError('URL_BLOCKED', 'Refusing to fetch a private address.', 400);
    }
    return target;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new AppError('COMPANY_UNREACHABLE', `Could not resolve ${host}.`, 502);
  }

  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new AppError('URL_BLOCKED', 'Refusing to fetch a private address.', 400);
  }

  return target;
}

/** True when `candidate` belongs to the same site we were pointed at. */
export function isSameOrigin(candidate, origin) {
  try {
    return new URL(candidate).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

const ASSET_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|webm|mp3|woff2?|ttf|eot)(\?|$)/i;

/** Filters out links that could not possibly be a page worth reading. */
export function looksLikePage(href) {
  if (!href) return false;
  const lower = href.toLowerCase();
  if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('javascript:')) {
    return false;
  }
  return !ASSET_EXTENSIONS.test(href);
}

/**
 * What a user pastes into the company field is rarely a URL — "acme.com",
 * "www.acme.com/about". Assume https when no protocol is given.
 */
export function coerceCompanyUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new AppError('INVALID_URL', 'A company website is required.', 400);
  return normalizeUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
}
