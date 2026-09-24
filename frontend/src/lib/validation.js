// Client-side twins of the server's Zod schemas, so a mistake lands inline instead of
// after a round trip. These deliberately mirror src/controllers/auth.controller.js and
// src/lib/urlGuard.js — if those change, these must follow.

export function checkEmail(value) {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  // Same shape the server's z.string().email() accepts, without pulling in a validator.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "must be a valid email address";
  return null;
}

export function checkPassword(value, { min = 8 } = {}) {
  if (!value) return "Enter your password.";
  if (value.length < min) return `must be at least ${min} characters`;
  return null;
}

/**
 * The twin of coerceCompanyUrl in src/lib/urlGuard.js: a bare "acme.com" is a perfectly
 * good answer, so prepend https:// when there is no scheme rather than rejecting it.
 * Returns the normalised URL so the form can show what will actually be fetched.
 */
export function normalizeCompanyUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, error: "A company website is required." };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a web address." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https addresses can be fetched." };
  }
  // A dot is what separates a real host from a typo like "acme" — but not the only
  // thing. The brief serves company fixtures from a local address and Appendix B's own
  // example is http://localhost:8099/acme/, so a dotless loopback host is legitimate
  // input, not a mistake. The server is the authority either way: urlGuard blocks
  // private and loopback addresses when NODE_ENV=production and allows them otherwise.
  if (!url.hostname.includes(".") && !isBareLocalHost(url.hostname)) {
    return { ok: false, error: "That doesn't look like a web address." };
  }

  url.hash = "";
  return { ok: true, url: url.toString() };
}

/** "localhost", or an IPv6 literal, which URL keeps wrapped in brackets. */
function isBareLocalHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "localhost" || (host.startsWith("[") && host.endsWith("]"));
}

export function checkDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days)) return "Whole days only.";
  if (days < 1 || days > 60) return "Between 1 and 60 days.";
  return null;
}

/**
 * VALIDATION_FAILED messages are "field: reason" segments joined with "; " — see
 * src/middleware/validate.js. Parsing them back onto fields is a fallback for anything
 * the client-side checks above missed; anything unrecognisable stays form-level.
 */
export function parseFieldErrors(message) {
  const fields = {};
  for (const segment of String(message ?? "").split("; ")) {
    const at = segment.indexOf(": ");
    if (at === -1) continue;
    const field = segment.slice(0, at).trim();
    const reason = segment.slice(at + 2).trim();
    if (field && reason && !field.includes(" ")) fields[field] = reason;
  }
  return fields;
}
