import { z } from 'zod';

/**
 * The exact Appendix A kit structure. Field names are fixed by the brief and must
 * not be renamed; extending is allowed where it genuinely helps. This schema is the
 * single source of structural truth — the graph validates against it before a kit is
 * returned, and the kit service validates against it before a kit is persisted.
 *
 * Written against the zod 3 API (pinned; @langchain/community refuses zod 4).
 */

export const REQUIREMENT_KINDS = ['technical', 'behavioural', 'domain'];
export const REQUIREMENT_PRIORITIES = ['must', 'nice'];
export const QUESTION_CATEGORIES = ['technical', 'behavioural', 'system-design', 'company-fit'];

export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(REQUIREMENT_KINDS),
  priority: z.enum(REQUIREMENT_PRIORITIES),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(QUESTION_CATEGORIES),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

export const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

export const scheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string()),
  // Integer minutes only. The brief calls this out explicitly: no floats.
  minutes: z.number().int().min(0),
});

export const scheduleSchema = z.object({
  days_available: z.number().int().min(1),
  days: z.array(scheduleDaySchema),
});

export const sourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().min(0),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});

export const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const roleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(requirementSchema),
});

export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().min(0),
});

const baseKitSchema = z.object({
  /**
   * An addition to Appendix A, which permits extension but not renaming.
   *
   * This is where "a thin JD produces a thin kit that says so" actually lives: an
   * unreachable site, a company with no hiring page, a description too short to extract
   * much from. The brief asks for those gaps to be recorded honestly *in the kit*, and
   * without this field the only record of them is a log line nobody reads. Optional, so
   * kits written before it existed still validate.
   */
  notes: z.array(z.string()).default([]),

  source: sourceSchema,
  company_brief: companyBriefSchema,
  role: roleSchema,
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: scheduleSchema,
  coverage: coverageSchema,
});

function reportDuplicates(ids, path, ctx) {
  const seen = new Set();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index, 'id'],
        message: `Duplicate id "${id}".`,
      });
    }
    seen.add(id);
  });
}

/**
 * Cross-field rules live here rather than on the leaf schemas because they span
 * sibling arrays: a question_id is only meaningful relative to the questions array.
 */
export const kitSchema = baseKitSchema.superRefine((kit, ctx) => {
  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
  const questionIds = new Set(kit.questions.map((q) => q.id));

  reportDuplicates(kit.role.requirements.map((r) => r.id), ['role', 'requirements'], ctx);
  reportDuplicates(kit.questions.map((q) => q.id), ['questions'], ctx);
  reportDuplicates(kit.flashcards.map((f) => f.id), ['flashcards'], ctx);

  // Every question must cite requirements that exist — this is what makes coverage
  // checkable rather than a matter of opinion.
  kit.questions.forEach((question, index) => {
    question.requirement_ids.forEach((rid) => {
      if (!requirementIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', index, 'requirement_ids'],
          message: `Question "${question.id}" cites unknown requirement "${rid}".`,
        });
      }
    });
  });

  kit.flashcards.forEach((flashcard, index) => {
    flashcard.requirement_ids.forEach((rid) => {
      if (!requirementIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flashcards', index, 'requirement_ids'],
          message: `Flashcard "${flashcard.id}" cites unknown requirement "${rid}".`,
        });
      }
    });
  });

  // The schedule must span exactly the days requested — scored automatically.
  if (kit.schedule.days.length !== kit.schedule.days_available) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['schedule', 'days'],
      message: `Schedule has ${kit.schedule.days.length} days but days_available is ${kit.schedule.days_available}.`,
    });
  }

  kit.schedule.days.forEach((day, index) => {
    if (day.day !== index + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule', 'days', index, 'day'],
        message: `Day numbers must run 1..n in order; expected ${index + 1}, got ${day.day}.`,
      });
    }
    day.question_ids.forEach((qid) => {
      if (!questionIds.has(qid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', 'days', index, 'question_ids'],
          message: `Day ${day.day} schedules unknown question "${qid}".`,
        });
      }
    });
  });

  kit.coverage.uncovered_requirement_ids.forEach((rid) => {
    if (!requirementIds.has(rid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coverage', 'uncovered_requirement_ids'],
        message: `Coverage names unknown requirement "${rid}".`,
      });
    }
  });
});

/**
 * Non-throwing validation. Returns the parsed kit on success, or a flat list of
 * human-readable issues that can be surfaced in a structured error or a note.
 */
export function validateKit(kit) {
  const result = kitSchema.safeParse(kit);
  if (result.success) return { ok: true, data: result.data, issues: [] };

  return {
    ok: false,
    data: null,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
