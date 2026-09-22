// fetch wrapper for the backend API. Always credentials: "include" so the
// httpOnly JWT cookie travels with each request.
//
// The backend answers every failure with { error: { code, message } } and a stable
// code vocabulary (UNAUTHENTICATED, KIT_NOT_FOUND, COMPANY_UNREACHABLE, ...). We keep
// the code intact so callers can branch on it, and the message intact so the UI can
// show it: 4xx messages are written for humans, 5xx ones are already redacted.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** The session is gone, one way or another — callers treat both the same. */
export function isAuthError(error) {
  return (
    error instanceof ApiError &&
    (error.code === "UNAUTHENTICATED" || error.code === "SESSION_EXPIRED")
  );
}

export async function apiFetch(path, { method = "GET", body, signal } = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    // An abort is the caller's own doing — let it through untouched so effects
    // can ignore it rather than rendering it as a failure.
    if (cause?.name === "AbortError") throw cause;
    throw new ApiError(
      "NETWORK_UNREACHABLE",
      "Could not reach the server. It may be starting up — try again in a moment.",
      0,
    );
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "Something went wrong.",
      response.status,
    );
  }

  return payload;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---- endpoints ---------------------------------------------------------- */

export async function getMe(signal) {
  const { user } = await apiFetch("/api/auth/me", { signal });
  return user;
}

export async function listKits(signal) {
  const { kits } = await apiFetch("/api/kits", { signal });
  return kits ?? [];
}
