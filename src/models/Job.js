import mongoose from 'mongoose';

/**
 * Job: one generation run. Generation takes ~90s, so the API returns 202 with a jobId
 * and the client polls this document. currentStep is written by the graph as each node
 * completes, which is what drives the progress UI (.claude/graph.md).
 */

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'];

/** What this run is doing: a fresh kit, or regenerating one section of an existing one. */
export const JOB_KINDS = ['generate', 'regenerate'];

const jobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: JOB_KINDS, default: 'generate' },
    status: { type: String, enum: JOB_STATUSES, default: 'queued', index: true },
    currentStep: { type: String, default: 'queued' },

    // Null until the run succeeds; for a regenerate it is set from the start.
    kitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', default: null, index: true },
    // Which section a regenerate targets: 'company_brief' | 'schedule' | a question category.
    section: { type: String, default: null },

    input: {
      jd: { type: String, default: '' },
      companyUrl: { type: String, default: '' },
      days: { type: Number, default: 1 },
    },

    dedupeHash: { type: String, default: '' },

    error: {
      type: new mongoose.Schema({ code: String, message: String }, { _id: false }),
      default: null,
    },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Recognising "this exact JD + company was just submitted" (prd §3.10).
jobSchema.index({ userId: 1, dedupeHash: 1, createdAt: -1 });

export const Job = mongoose.model('Job', jobSchema);
export default Job;
