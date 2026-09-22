import { z } from 'zod';

import * as kitService from '../services/kit.service.js';
import * as jobService from '../services/job.service.js';
import { QUESTION_CATEGORIES } from '../lib/kitSchema.js';
import { runRegenerationJob, startInBackground } from '../services/generation.service.js';

/** CRUD over a kit and its items — thin req/res handling only. */

const REGENERATABLE = [...QUESTION_CATEGORIES, 'flashcards', 'company_brief', 'schedule'];

export const questionCreateSchema = z.object({
  category: z.enum(QUESTION_CATEGORIES),
  prompt: z.string().min(1),
  answer_outline: z.string().optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  requirement_ids: z.array(z.string()).optional(),
});

export const questionPatchSchema = z
  .object({
    prompt: z.string().min(1).optional(),
    answer_outline: z.string().optional(),
    category: z.enum(QUESTION_CATEGORIES).optional(),
    difficulty: z.number().int().min(1).max(3).optional(),
    requirement_ids: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'no fields to update' });

export const reorderSchema = z.object({
  moves: z
    .array(
      z.object({
        id: z.string().min(1),
        order: z.number().int().min(0).optional(),
        category: z.enum(QUESTION_CATEGORIES).optional(),
      }),
    )
    .min(1),
});

export const flashcardCreateSchema = z.object({
  front: z.string().min(1),
  back: z.string().optional(),
  requirement_ids: z.array(z.string()).optional(),
});

export const flashcardPatchSchema = z
  .object({
    front: z.string().min(1).optional(),
    back: z.string().optional(),
    requirement_ids: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'no fields to update' });

export const briefPatchSchema = z
  .object({
    summary: z.string().optional(),
    what_they_do: z.string().optional(),
    sources: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'no fields to update' });

export const confidenceSchema = z.object({ confidence: z.number().int().min(1).max(5) });

export const regenerateSchema = z.object({ section: z.enum(REGENERATABLE) });

/** Wraps a service call that returns a kit document into the standard response. */
const respondWithKit = (handler) => async (req, res, next) => {
  try {
    const kit = await handler(req);
    res.json({ kit });
  } catch (err) {
    next(err);
  }
};

export async function list(req, res, next) {
  try {
    res.json({ kits: await kitService.listKits(req.user.id) });
  } catch (err) {
    next(err);
  }
}

export const get = respondWithKit((req) => kitService.getKit(req.user.id, req.params.id));

export async function remove(req, res, next) {
  try {
    res.json(await kitService.deleteKit(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function exportKit(req, res, next) {
  try {
    res.json(await kitService.exportKit(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

export const addQuestion = respondWithKit((req) =>
  kitService.addQuestion(req.user.id, req.params.id, req.body),
);
export const updateQuestion = respondWithKit((req) =>
  kitService.updateQuestion(req.user.id, req.params.id, req.params.qid, req.body),
);
export const deleteQuestion = respondWithKit((req) =>
  kitService.deleteQuestion(req.user.id, req.params.id, req.params.qid),
);
export const reorderQuestions = respondWithKit((req) =>
  kitService.reorderQuestions(req.user.id, req.params.id, req.body.moves),
);

export const addFlashcard = respondWithKit((req) =>
  kitService.addFlashcard(req.user.id, req.params.id, req.body),
);
export const updateFlashcard = respondWithKit((req) =>
  kitService.updateFlashcard(req.user.id, req.params.id, req.params.fid, req.body),
);
export const deleteFlashcard = respondWithKit((req) =>
  kitService.deleteFlashcard(req.user.id, req.params.id, req.params.fid),
);

export const updateBrief = respondWithKit((req) =>
  kitService.updateBrief(req.user.id, req.params.id, req.body),
);

export const recordConfidence = respondWithKit((req) =>
  kitService.recordConfidence(req.user.id, req.params.id, req.params.fid, req.body.confidence),
);

export async function practiceNext(req, res, next) {
  try {
    res.json(await kitService.practiceSession(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
}

/**
 * Regeneration is a pipeline run, so it answers 202 with a job to poll rather than
 * holding the request open for the duration.
 */
export async function regenerate(req, res, next) {
  try {
    const kit = await kitService.getKit(req.user.id, req.params.id);

    const job = await jobService.createJob({
      userId: req.user.id,
      kind: 'regenerate',
      kitId: kit.id,
      section: req.body.section,
    });

    startInBackground(runRegenerationJob, job.id);
    res.status(202).json({ job: jobService.toStatusPayload(job) });
  } catch (err) {
    next(err);
  }
}
