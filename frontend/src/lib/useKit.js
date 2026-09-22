"use client";

import { useCallback, useEffect, useState } from "react";
import { getKit } from "@/lib/api";

/**
 * Owns one kit. Every mutation endpoint answers with the whole kit, so `mutate` just
 * swaps state for whatever the server returns — no partial reconciliation, and ids and
 * orders minted server-side land automatically.
 *
 * Text editing is the one thing that does NOT go through here on every keystroke; see
 * InlineEdit, which keeps the value local while focused and commits once, on blur.
 */
export function useKit(kitId) {
  const [kit, setKit] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!kitId) return;
    const controller = new AbortController();

    getKit(kitId, controller.signal)
      .then((loaded) => setKit(loaded))
      .catch((cause) => {
        if (cause?.name === "AbortError") return;
        setError(cause);
      });

    return () => controller.abort();
  }, [kitId]);

  /** Runs an API call that returns a kit, and adopts the result. */
  const mutate = useCallback(async (call) => {
    setBusy(true);
    try {
      const next = await call();
      setKit(next);
      return next;
    } catch (cause) {
      setError(cause);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  /** After a regeneration job succeeds — the job payload never carries the kit. */
  const refetch = useCallback(async () => {
    const next = await getKit(kitId);
    setKit(next);
    return next;
  }, [kitId]);

  return { kit, error, busy, mutate, refetch, dismissError: () => setError(null) };
}
