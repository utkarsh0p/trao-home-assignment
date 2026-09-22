import { z } from 'zod';

import * as jobService from '../services/job.service.js';
import { runGenerationJob, startInBackground } from '../services/generation.service.js';

/** Create a generation job (202 + jobId) and report its status. */

export const createJobSchema = z.object({
  jd: z.string().min(1, 'paste the job description'),
  companyUrl: z.string().min(1, 'a company website is required'),
  // 1 and 60 are both named in the brief's edge cases.
  days: z.number().int().min(1).max(60),
});

export async function create(req, res, next) {
  try {
    const input = req.body;
    const dedupeHash = jobService.dedupeHashFor(input);

    // The same posting submitted twice in quick succession returns the run already
    // in flight rather than starting a second one (prd §3.10).
    const existing = await jobService.findRecentDuplicate(req.user.id, dedupeHash);
    if (existing) {
      return res.status(202).json({ job: jobService.toStatusPayload(existing), duplicate: true });
    }

    const job = await jobService.createJob({ userId: req.user.id, kind: 'generate', input });
    startInBackground(runGenerationJob, job.id);

    return res.status(202).json({ job: jobService.toStatusPayload(job) });
  } catch (err) {
    return next(err);
  }
}

export async function status(req, res, next) {
  try {
    const job = await jobService.getJob(req.user.id, req.params.id);
    res.json({ job: jobService.toStatusPayload(job) });
  } catch (err) {
    next(err);
  }
}
