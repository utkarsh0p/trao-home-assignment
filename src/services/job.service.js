import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { Job } from '../models/Job.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Job lifecycle. Generation takes ~90s, so the API answers 202 with a jobId and the
 * client polls; the graph writes each completed node into currentStep as it goes
 * (.claude/graph.md), which is what the progress UI renders.
 */

/** How recently an identical submission counts as a duplicate rather than a retry. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Same JD + company + horizon is the same request (prd §3.10). */
export function dedupeHashFor({ jd, companyUrl, days }) {
  return crypto
    .createHash('sha256')
    .update(`${jd.trim()}::${companyUrl.trim().toLowerCase()}::${days}`)
    .digest('hex');
}

export async function findRecentDuplicate(userId, dedupeHash) {
  return Job.findOne({
    userId,
    dedupeHash,
    status: { $in: ['queued', 'running', 'succeeded'] },
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  }).sort({ createdAt: -1 });
}

export async function createJob({ userId, kind = 'generate', input, kitId = null, section = null }) {
  const dedupeHash = input ? dedupeHashFor(input) : '';
  return Job.create({
    userId,
    kind,
    kitId,
    section,
    input: input ?? {},
    dedupeHash,
    status: 'queued',
    currentStep: 'queued',
  });
}

export async function getJob(userId, jobId) {
  if (!mongoose.isValidObjectId(jobId)) {
    throw new AppError('JOB_NOT_FOUND', 'Job not found.', 404);
  }
  const job = await Job.findOne({ _id: jobId, userId });
  if (!job) throw new AppError('JOB_NOT_FOUND', 'Job not found.', 404);
  return job;
}

export async function startJob(jobId) {
  return Job.findByIdAndUpdate(
    jobId,
    { status: 'running', currentStep: 'starting', startedAt: new Date() },
    { new: true },
  );
}

/**
 * Called from the graph on every completed node. Deliberately fire-and-forget at the
 * call site: a failed progress write must never take down the run it is reporting on.
 */
export async function updateJobStep(jobId, step, trail) {
  const patch = { currentStep: step };
  // Only written when the caller has one — a regeneration job reports free-text steps
  // and has no research trail, and overwriting the field with [] would erase it.
  if (Array.isArray(trail) && trail.length > 0) patch.trail = trail;
  return Job.findByIdAndUpdate(jobId, patch);
}

export async function finishJob(jobId, kitId) {
  return Job.findByIdAndUpdate(
    jobId,
    { status: 'succeeded', currentStep: 'done', kitId, finishedAt: new Date() },
    { new: true },
  );
}

export async function failJob(jobId, { code, message }) {
  return Job.findByIdAndUpdate(
    jobId,
    { status: 'failed', error: { code, message }, finishedAt: new Date() },
    { new: true },
  );
}

/**
 * Jobs are in-process, so a restart mid-run orphans anything left 'running'. Sweeping
 * them at boot is the disclosed trade-off in .claude/tech-stack.md — without it the
 * client polls a job that will never move again.
 */
export async function markStaleJobsFailed() {
  const result = await Job.updateMany(
    { status: { $in: ['queued', 'running'] } },
    {
      status: 'failed',
      error: {
        code: 'RUN_INTERRUPTED',
        message: 'The server restarted while this kit was being generated. Please try again.',
      },
      finishedAt: new Date(),
    },
  );
  return result.modifiedCount ?? 0;
}

/** The polling projection — everything the client needs, nothing it does not. */
export function toStatusPayload(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    currentStep: job.currentStep,
    trail: (job.trail ?? []).map(({ id, node, kind, url, label, status, detail }) => ({
      id,
      node,
      kind,
      url,
      label,
      status,
      detail,
    })),
    kitId: job.kitId ? String(job.kitId) : null,
    section: job.section,
    error: job.error ? { code: job.error.code, message: job.error.message } : null,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  };
}
