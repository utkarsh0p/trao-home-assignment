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
  /**
   * An addition to Appendix A, which permits extension but not renaming.
   *
   * Which question categories this requirement could honestly be asked about, decided by
   * the model that read the posting. It replaces the keyword lists planGeneration used to
   * route by, and it is internal: Kit.toAppendixA picks the Appendix A fields explicitly,
   * so this never reaches the export or the batch output.
   *
   * Defaulted, so kits written before it existed still validate.
   */
  supports: z.array(z.enum(QUESTION_CATEGORIES)).default([]),
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

/** What kind of thing a curated resource is. Nothing here is written by a model. */
export const RESOURCE_KINDS = ['video', 'article'];

/**
 * A real link, found by searching, that teaches one of the categories this kit asks
 * about. Every field is either copied from a search result or derived from its URL —
 * there is no field a model could fill in, which is what keeps CLAUDE.md rule 4 (never
 * invent) mechanical rather than a matter of prompt wording.
 */
export const resourceSchema = z.object({
  id: z.string().min(1),
  category: z.enum(QUESTION_CATEGORIES),
  kind: z.enum(RESOURCE_KINDS),
  title: z.string().min(1),
  url: z.string().min(1),
  // 'YouTube', or the article's host. Derived from the URL, never guessed.
  source: z.string().default(''),
  // Derived from a YouTube video id; empty for an article.
  thumbnail: z.string().default(''),
});

export const scheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: z.string(),
  question_ids: z.array(z.string()),
  /**
   * An addition to Appendix A, which permits extension but not renaming.
   *
   * Without it the flashcards are a pile the plan never refers to: a user following the
   * schedule day by day is never told to touch them. Defaulted, so kits written before
   * it existed still validate.
   */
  flashcard_ids: z.array(z.string()).default([]),
  /**
   * An addition to Appendix A, which permits extension but not renaming.
   *
   * What to watch or read on this day, chosen by the same arithmetic that places the
   * questions — which is also what makes it survive repair, since repair rebuilds the
   * schedule from scratch. Defaulted, so kits written before it existed still validate.
   */
  resource_ids: z.array(z.string()).default([]),
  // Integer minutes only. The brief calls this out explicitly: no floats.
  // Resources deliberately do not add to this: the estimate is of the work the kit
  // asks for, and a link is an offer rather than an assignment.
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

export const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'staff', 'unstated'];

export const roleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  // Normalised companion to the free-text `seniority`, for planGeneration to branch on.
  // Also an extension, also absent from the Appendix A export. Defaulted for old kits.
  seniority_level: z.enum(SENIORITY_LEVELS).default('unstated'),
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

  /**
   * An addition to Appendix A, which permits extension but not renaming.
   *
   * Videos and articles found by searching for the role, one category at a time. They
   * are app state in the sense that Kit.toAppendixA() does not export them — the batch
   * output stays exactly the shape the brief specifies — but they are kit content, so
   * they are validated like everything else. Defaulted, so kits written before it
   * existed still validate.
   */
  resources: z.array(resourceSchema).default([]),

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
  const flashcardIds = new Set(kit.flashcards.map((f) => f.id));
  const resourceIds = new Set((kit.resources ?? []).map((r) => r.id));

  reportDuplicates(kit.role.requirements.map((r) => r.id), ['role', 'requirements'], ctx);
  reportDuplicates(kit.questions.map((q) => q.id), ['questions'], ctx);
  reportDuplicates(kit.flashcards.map((f) => f.id), ['flashcards'], ctx);
  reportDuplicates((kit.resources ?? []).map((r) => r.id), ['resources'], ctx);

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
    // Same rule as question_ids: a day may only point at cards that exist.
    (day.flashcard_ids ?? []).forEach((fid) => {
      if (!flashcardIds.has(fid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', 'days', index, 'flashcard_ids'],
          message: `Day ${day.day} schedules unknown flashcard "${fid}".`,
        });
      }
    });
    (day.resource_ids ?? []).forEach((rid) => {
      if (!resourceIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', 'days', index, 'resource_ids'],
          message: `Day ${day.day} schedules unknown resource "${rid}".`,
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
