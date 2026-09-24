import { Job } from '../models/Job.js';
import { applyRegeneratedSection, getKit, persistKit } from './kit.service.js';
import { failJob, finishJob, startJob, updateJobStep } from './job.service.js';
import { regenerateSection, runPipeline } from './pipeline.service.js';

/**
 * Wraps a pipeline run in a Job document so the API can answer immediately and the
 * client can poll (.claude/tech-stack.md). The work runs in this process — no Redis,
 * no second service to keep alive on a free tier — and the trade-off is that a restart
 * mid-run orphans a job, which job.service.markStaleJobsFailed() sweeps at boot.
 */

/** Kicks off a run without awaiting it. The caller has already answered 202. */
export function startInBackground(runner, jobId) {
  setImmediate(() => {
    runner(jobId).catch((error) => {
      console.error(`Job ${jobId} crashed outside its own error handling:`, error);
    });
  });
}

export async function runGenerationJob(jobId) {
  const job = await Job.findById(jobId);
  if (!job) return;

  await startJob(jobId);

  try {
    const { kit, notes, errors } = await runPipeline({
      jd: job.input.jd,
      companyUrl: job.input.companyUrl,
      days: job.input.days,
      onStep: (step, trail) => updateJobStep(jobId, step, trail),
      onActivity: (trail, step) => updateJobStep(jobId, step, trail),
    });

    const kitDoc = await persistKit(job.userId, {
      kit,
      notes,
      researchErrors: errors,
      dedupeHash: job.dedupeHash,
    });

    await finishJob(jobId, kitDoc.id);
  } catch (error) {
    await failJob(jobId, {
      code: error.code ?? 'PIPELINE_FAILED',
      message: error.message ?? 'Generation failed.',
    });
  }
}

export async function runRegenerationJob(jobId) {
  const job = await Job.findById(jobId);
  if (!job) return;

  await startJob(jobId);

  try {
    const kitDoc = await getKit(job.userId, job.kitId);
    await updateJobStep(jobId, `regenerating ${job.section}`);

    const generated = await regenerateSection(kitDoc, job.section);
    const { skipped, replacedCount } = await applyRegeneratedSection(
      job.userId,
      job.kitId,
      job.section,
      generated,
    );

    // "Skipped" is not a failure: it means the user had edited or pinned that section,
    // so we deliberately left their work alone and say so.
    await updateJobStep(
      jobId,
      skipped
        ? 'skipped — your edits to this section were kept'
        : `replaced ${replacedCount} generated item(s)`,
    );
    await finishJob(jobId, job.kitId);
  } catch (error) {
    await failJob(jobId, {
      code: error.code ?? 'REGENERATION_FAILED',
      message: error.message ?? 'Regeneration failed.',
    });
  }
}
