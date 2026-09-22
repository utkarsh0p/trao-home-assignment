import mongoose from 'mongoose';
import { QUESTION_CATEGORIES, REQUIREMENT_KINDS, REQUIREMENT_PRIORITIES } from '../lib/kitSchema.js';

/**
 * Kit: the Appendix A structure, mirrored field-for-field so the builder can do
 * per-item read-modify-write, plus the extra state the app needs.
 *
 * Appendix A allows extension but not renaming. The additions are:
 *   - origin ('generated' | 'edited' | 'manual') and pinned, per item — this is how a
 *     regeneration knows what it is allowed to replace (.claude/decisions.md).
 *   - order on questions — the persisted sort key behind reorder / move-between-categories.
 *   - confidence / timesSeen / lastSeenAt on flashcards — practice mode.
 *   - notes and errors — honest reporting of what could not be retrieved.
 *
 * toAppendixA() strips all of it back to the exact seven-key shape the brief specifies.
 */

const ORIGINS = ['generated', 'edited', 'manual'];

const subdoc = { _id: false };

const requirementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    kind: { type: String, enum: REQUIREMENT_KINDS, required: true },
    priority: { type: String, enum: REQUIREMENT_PRIORITIES, required: true },
  },
  subdoc,
);

const questionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    requirement_ids: { type: [String], default: [] },
    category: { type: String, enum: QUESTION_CATEGORIES, required: true },
    prompt: { type: String, required: true },
    answer_outline: { type: String, default: '' },
    difficulty: { type: Number, min: 1, max: 3, default: 2 },

    order: { type: Number, default: 0 },
    origin: { type: String, enum: ORIGINS, default: 'generated' },
    pinned: { type: Boolean, default: false },
  },
  subdoc,
);

const flashcardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    front: { type: String, required: true },
    back: { type: String, default: '' },
    requirement_ids: { type: [String], default: [] },

    order: { type: Number, default: 0 },
    origin: { type: String, enum: ORIGINS, default: 'generated' },
    pinned: { type: Boolean, default: false },

    // Practice mode. null confidence means "not yet seen", which sorts first.
    confidence: { type: Number, min: 1, max: 5, default: null },
    timesSeen: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: null },
  },
  subdoc,
);

const scheduleDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    focus: { type: String, default: '' },
    question_ids: { type: [String], default: [] },
    minutes: { type: Number, default: 0 },
  },
  subdoc,
);

const KitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: '' },
    // Lets a duplicate submission of the same JD + company be recognised (prd §3.10).
    dedupeHash: { type: String, default: '', index: true },

    source: {
      company: { type: String, default: '' },
      company_url: { type: String, default: '' },
      role: { type: String, default: '' },
      location: { type: String, default: '' },
      jd_chars: { type: Number, default: 0 },
      researched_at: { type: String, default: '' },
      pages_used: { type: [String], default: [] },
    },

    company_brief: {
      summary: { type: String, default: '' },
      what_they_do: { type: String, default: '' },
      sources: { type: [String], default: [] },
      origin: { type: String, enum: ORIGINS, default: 'generated' },
      pinned: { type: Boolean, default: false },
    },

    role: {
      title: { type: String, default: '' },
      seniority: { type: String, default: '' },
      responsibilities: { type: [String], default: [] },
      requirements: { type: [requirementSchema], default: [] },
    },

    questions: { type: [questionSchema], default: [] },
    flashcards: { type: [flashcardSchema], default: [] },

    schedule: {
      days_available: { type: Number, default: 1 },
      days: { type: [scheduleDaySchema], default: [] },
      origin: { type: String, enum: ORIGINS, default: 'generated' },
      pinned: { type: Boolean, default: false },
    },

    coverage: {
      uncovered_requirement_ids: { type: [String], default: [] },
      passes: { type: Number, default: 0 },
    },

    // How "skip and report" (prd §3.2) surfaces to the user rather than being swallowed.
    // Named researchErrors, not errors: `errors` is a reserved Mongoose document
    // property and shadowing it breaks validation handling.
    notes: { type: [String], default: [] },
    researchErrors: {
      type: [
        new mongoose.Schema(
          { step: String, code: String, message: String },
          subdoc,
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, minimize: false },
);

// The list route is always "my kits, newest first".
KitSchema.index({ userId: 1, createdAt: -1 });

/**
 * Serialises back to the exact Appendix A shape: the seven top-level keys, nothing
 * else, with questions in their user-visible order. Used by the export path and by
 * validation before persist, so the stored document is always checked against the
 * shape the brief specifies rather than against our extended one.
 */
KitSchema.methods.toAppendixA = function toAppendixA() {
  const kit = this.toObject({ depopulate: true });

  const questions = [...(kit.questions ?? [])]
    .sort((a, b) => a.order - b.order)
    .map(({ id, requirement_ids, category, prompt, answer_outline, difficulty }) => ({
      id,
      requirement_ids,
      category,
      prompt,
      answer_outline,
      difficulty,
    }));

  const flashcards = [...(kit.flashcards ?? [])]
    .sort((a, b) => a.order - b.order)
    .map(({ id, front, back, requirement_ids }) => ({ id, front, back, requirement_ids }));

  return {
    source: {
      company: kit.source.company,
      company_url: kit.source.company_url,
      role: kit.source.role,
      location: kit.source.location,
      jd_chars: kit.source.jd_chars,
      researched_at: kit.source.researched_at,
      pages_used: kit.source.pages_used,
    },
    company_brief: {
      summary: kit.company_brief.summary,
      what_they_do: kit.company_brief.what_they_do,
      sources: kit.company_brief.sources,
    },
    role: {
      title: kit.role.title,
      seniority: kit.role.seniority,
      responsibilities: kit.role.responsibilities,
      requirements: kit.role.requirements.map(({ id, text, kind, priority }) => ({
        id,
        text,
        kind,
        priority,
      })),
    },
    questions,
    flashcards,
    schedule: {
      days_available: kit.schedule.days_available,
      days: kit.schedule.days.map(({ day, focus, question_ids, minutes }) => ({
        day,
        focus,
        question_ids,
        minutes,
      })),
    },
    coverage: {
      uncovered_requirement_ids: kit.coverage.uncovered_requirement_ids,
      passes: kit.coverage.passes,
    },
  };
};

export const Kit = mongoose.model('Kit', KitSchema);
export default Kit;
