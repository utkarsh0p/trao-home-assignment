"use client";

import { useEffect, useState } from "react";
import { getJob } from "@/lib/api";

const POLL_MS = 1500;
const TERMINAL = new Set(["succeeded", "failed"]);

export function isTerminal(job) {
  return Boolean(job) && TERMINAL.has(job.status);
}

/**
 * Polls a generation job until it settles. Generation takes ~40s, so 1.5s is frequent
 * enough to feel live without hammering an endpoint that isn't rate limited (and
 * therefore shouldn't be abused). Stops dead on a terminal status, and on unmount.
 */
export function useJob(jobId) {
  const [state, setState] = useState({ job: null, error: null });

  useEffect(() => {
    if (!jobId) return;

    const controller = new AbortController();
    let timer = 0;
    let stopped = false;

    const poll = async () => {
      try {
        const job = await getJob(jobId, controller.signal);
        if (stopped) return;
        setState({ job, error: null });
        if (!TERMINAL.has(job.status)) timer = window.setTimeout(poll, POLL_MS);
      } catch (cause) {
        if (stopped || cause?.name === "AbortError") return;
        setState((previous) => ({ job: previous.job, error: cause }));
        // A blip mid-run shouldn't kill the whole view; keep trying until unmount.
        if (cause?.code === "NETWORK_UNREACHABLE") timer = window.setTimeout(poll, POLL_MS * 2);
      }
    };

    poll();

    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId]);

  return state;
}
