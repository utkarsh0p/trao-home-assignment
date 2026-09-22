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

export async function deleteKit(kitId) {
  return apiFetch(`/api/kits/${kitId}`, { method: "DELETE" });
}

export async function getKit(kitId, signal) {
  const { kit } = await apiFetch(`/api/kits/${kitId}`, { signal });
  return kit;
}

/** The Appendix A projection — seven keys, none of our bookkeeping fields. */
export async function exportKit(kitId) {
  return apiFetch(`/api/kits/${kitId}/export`);
}

/* Every kit mutation answers with the whole kit, so each of these returns one. */

const kitMutation = (path, method) => async (kitId, body) => {
  const { kit } = await apiFetch(`/api/kits/${kitId}${path}`, { method, body });
  return kit;
};

export const addQuestion = kitMutation("/questions", "POST");
export const addFlashcard = kitMutation("/flashcards", "POST");
export const updateBrief = kitMutation("/brief", "PATCH");
export const reorderQuestions = kitMutation("/questions/reorder", "PATCH");

export async function updateQuestion(kitId, questionId, patch) {
  const { kit } = await apiFetch(`/api/kits/${kitId}/questions/${questionId}`, {
    method: "PATCH",
    body: patch,
  });
  return kit;
}

export async function deleteQuestion(kitId, questionId) {
  const { kit } = await apiFetch(`/api/kits/${kitId}/questions/${questionId}`, {
    method: "DELETE",
  });
  return kit;
}

export async function updateFlashcard(kitId, flashcardId, patch) {
  const { kit } = await apiFetch(`/api/kits/${kitId}/flashcards/${flashcardId}`, {
    method: "PATCH",
    body: patch,
  });
  return kit;
}

export async function deleteFlashcard(kitId, flashcardId) {
  const { kit } = await apiFetch(`/api/kits/${kitId}/flashcards/${flashcardId}`, {
    method: "DELETE",
  });
  return kit;
}

/* ---------------------------------------------------------------- practice mode */

/**
 * The next session's deck, already ordered by the server (unseen first, then least
 * confident). Unlike every other kit endpoint this answers with a derived view rather
 * than a kit, so it must NOT be handed to useKit's `mutate`.
 */
export async function practiceNext(kitId, signal) {
  return apiFetch(`/api/kits/${kitId}/practice/next`, { signal });
}

/** Records how confident the user felt. Answers with the whole kit, so `mutate` is fine. */
export async function recordConfidence(kitId, flashcardId, confidence) {
  const { kit } = await apiFetch(`/api/kits/${kitId}/practice/${flashcardId}`, {
    method: "POST",
    body: { confidence },
  });
  return kit;
}

/** 202 + a job. The kit is not returned — poll, then refetch. */
export async function regenerateSection(kitId, section) {
  const { job } = await apiFetch(`/api/kits/${kitId}/regenerate`, {
    method: "POST",
    body: { section },
  });
  return job;
}

export async function register(credentials) {
  const { user } = await apiFetch("/api/auth/register", {
    method: "POST",
    body: credentials,
  });
  return user;
}

export async function login(credentials) {
  const { user } = await apiFetch("/api/auth/login", {
    method: "POST",
    body: credentials,
  });
  return user;
}

export async function logout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

/** Returns the whole body — callers need `duplicate` as well as the job. */
export async function createJob({ jd, companyUrl, days }) {
  return apiFetch("/api/jobs", {
    method: "POST",
    // days is z.number(), not z.coerce.number() — a string here fails validation.
    body: { jd, companyUrl, days: Number(days) },
  });
}

export async function getJob(jobId, signal) {
  const { job } = await apiFetch(`/api/jobs/${jobId}`, { signal });
  return job;
}
