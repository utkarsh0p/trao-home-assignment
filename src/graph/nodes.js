import { z } from 'zod';

import { buildSchedule } from '../services/schedule.service.js';
import { checkCoverage, toCoverageField } from '../services/coverage.service.js';
import { clampText, dataBlock, generateStructured, isLlmConfigured } from '../lib/llm.js';
import { crawlSite, expandHub } from '../lib/crawler.js';
import { fetchPage } from '../lib/scraper.js';
import { searchPublicDiscussion } from '../lib/search.js';
import {
  assertFetchable,
  canonicalKey,
  coerceCompanyUrl,
  companyNameFromUrl,
} from '../lib/urlGuard.js';
import { QUESTION_CATEGORIES } from '../lib/kitSchema.js';
import { validateKit } from '../lib/kitSchema.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Individual graph nodes (.claude/graph.md).
 *
 * The contract for every research node: it never throws. A source that cannot be
 * retrieved is appended to `errors` with a note and the run continues, because a
 * company with no findable hiring page must produce an honest thin kit rather than a
 * failure (prd §3.2, §3.10). Only `prepare` and `validate_kit` can end a run.
 */

const THIN_JD_CHARS = 400;
const MAX_PAGES_TO_FETCH = 4;
const MAX_QUESTIONS_PER_CATEGORY = 6;

const asError = (step, error) => ({
  step,
  code: error?.code ?? 'STEP_FAILED',
  message: String(error?.message ?? error).slice(0, 300),
});

/* ---------------------------------------------------------------------- prepare */

/**
 * Deterministic. Establishes what we know before any source is touched.
 *
 * A company URL we cannot use is a missing source, not a failed run: we still hold a
 * job description, and a kit built from it alone is a real kit with an honest gap in it
 * (prd §3.2, §3.10 — "reserve failed for a case you could not produce a kit for at
 * all"). The single exception is a refusal to fetch a private address, which is a
 * security decision and stays fatal.
 */
export async function prepare(state) {
  const { jd = '', companyUrl = '', days = 1 } = state.input ?? {};

  const jdChars = jd.trim().length;
  const notes = [];
  const errors = [];

  let company = { name: '', normalizedUrl: '', origin: '', jdChars };

  try {
    const url = coerceCompanyUrl(companyUrl);
    await assertFetchable(url);
    company = {
      name: companyNameFromUrl(url),
      normalizedUrl: url.href,
      origin: url.origin,
      jdChars,
    };
  } catch (error) {
    if (error.code === 'URL_BLOCKED') throw error;

    errors.push(asError('prepare', error));
    notes.push(
      'No usable company website was given, so this kit is built from the job description alone and contains no company research.',
    );
  }

  // A thin description yields a thin kit that says so — it is not an error, and
  // inventing requirements to pad it would be worse than reporting the shortage.
  if (jdChars < THIN_JD_CHARS) {
    notes.push(
      `The job description is only ${jdChars} characters, so few requirements could be extracted. This kit is correspondingly thin.`,
    );
  }

  return { company, notes, errors };
}

/* ----------------------------------------------------- extract_requirements (LLM) */

const requirementExtractionSchema = z.object({
  title: z.string().describe('The role title exactly as the posting gives it'),
  seniority: z.string().describe('e.g. Junior, Mid, Senior, Staff. Empty string if unstated'),
  location: z.string().describe('Empty string if the posting does not say'),
  responsibilities: z.array(z.string()),
  requirements: z.array(
    z.object({
      text: z.string().describe('The requirement, in the posting’s own terms'),
      kind: z.enum(['technical', 'behavioural', 'domain']),
      priority: z
        .enum(['must', 'nice'])
        .describe('"must" only if the posting states it as required; "nice" for bonus/preferred'),
    }),
  ),
});

const EXTRACTION_SYSTEM = [
  'You extract requirements from a job description for interview preparation.',
  '',
  'Rules you must follow exactly:',
  '- Extract ONLY what the description actually states. Never add a requirement that is not there.',
  '- A short description must produce few requirements. Returning three requirements for a',
  '  three-line posting is correct; padding it to fifteen is a failure.',
  '- priority is taken from how the posting words it. "required", "must have", "you have" are',
  '  "must". "bonus", "nice to have", "preferred", "a plus" are "nice".',
  '- kind: "technical" for tools, languages, systems; "behavioural" for collaboration,',
  '  communication, leadership; "domain" for industry or product knowledge.',
].join('\n');

export async function extractRequirements(state) {
  const jd = state.input?.jd ?? '';

  try {
    const result = await generateStructured({
      schema: requirementExtractionSchema,
      name: 'requirements',
      system: EXTRACTION_SYSTEM,
      user: `Extract the role details and requirements from this job description.\n\n${dataBlock('JOB DESCRIPTION', jd)}`,
    });

    // Ids are assigned here, not by the model: they must be stable and unique, and
    // that is arithmetic rather than a judgement call.
    const requirements = result.requirements.map((requirement, index) => ({
      id: `r${index + 1}`,
      text: requirement.text,
      kind: requirement.kind,
      priority: requirement.priority,
    }));

    const notes =
      requirements.length === 0
        ? ['No requirements could be extracted from the job description.']
        : [];

    return {
      requirements,
      research: { role: { title: result.title, seniority: result.seniority, location: result.location, responsibilities: result.responsibilities } },
      notes,
      researchBranchesDone: 1,
    };
  } catch (error) {
    return {
      requirements: [],
      errors: [asError('extract_requirements', error)],
      notes: ['Requirement extraction failed, so this kit has no requirement list.'],
      researchBranchesDone: 1,
    };
  }
}

/* ------------------------------------------------------------- crawl_site (IO) */

export async function crawlSiteNode(state) {
  if (!state.company?.normalizedUrl) return {};

  try {
    const { seedPage, candidates } = await crawlSite(state.company.normalizedUrl);
    return {
      linkCandidates: candidates,
      pagesFetched: [{ ...seedPage, role: 'home' }],
    };
  } catch (error) {
    return {
      errors: [asError('crawl_site', error)],
      notes: [`The company website at ${state.company.normalizedUrl} could not be retrieved.`],
    };
  }
}

/* -------------------------------------------------------------- rank_links (LLM) */

const rankingSchema = z.object({
  pages: z.array(
    z.object({
      url: z.string(),
      role: z.enum(['about', 'hiring', 'blog', 'product', 'other']),
      confidence: z.number().min(0).max(1),
    }),
  ),
  hiringPageConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe('How confident you are that a real hiring/careers page is in this list'),
  // Empty string rather than null: Gemini's response_schema is proto-based and rejects
  // the union type that .nullable() emits ("type": ["string", "null"]).
  bestHubUrl: z
    .string()
    .describe('A section index worth expanding if no hiring page is present, else an empty string'),
});

const RANKING_SYSTEM = [
  'You are ranking links harvested from a company website to decide which pages are',
  'worth reading for interview preparation.',
  '',
  'We want: what the company does (about/product) and how they hire (careers, jobs,',
  'hiring process, engineering handbook, life-at pages).',
  '',
  'Companies bury hiring pages under many different paths, so judge by the link text and',
  'the URL together rather than looking for a fixed path. If nothing in the list looks',
  'like a hiring page, say so honestly with a low hiringPageConfidence and name the one',
  'section index most likely to lead to one as bestHubUrl.',
  'Only return URLs that appear in the provided list.',
].join('\n');

export async function rankLinks(state) {
  const candidates = state.linkCandidates ?? [];
  if (candidates.length === 0) return { rankedPages: [] };

  const listing = candidates.map((link) => `${link.url} — ${link.text || '(no text)'}`).join('\n');

  try {
    const result = await generateStructured({
      schema: rankingSchema,
      name: 'ranked_links',
      system: RANKING_SYSTEM,
      user: `Rank these links.\n\n${dataBlock('LINK CANDIDATES', listing, 8000)}`,
    });

    // The model can only choose from what we harvested; a URL it invented is dropped.
    const known = new Set(candidates.map((link) => link.url));
    const ranked = result.pages
      .filter((page) => known.has(page.url))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      rankedPages: ranked,
      hiringPageConfidence: result.hiringPageConfidence,
      bestHubUrl: known.has(result.bestHubUrl) ? result.bestHubUrl : null,
    };
  } catch (error) {
    // Fall back to the raw candidate order rather than abandoning the crawl.
    return {
      rankedPages: candidates.slice(0, MAX_PAGES_TO_FETCH).map((link) => ({
        url: link.url,
        role: 'other',
        confidence: 0.2,
      })),
      errors: [asError('rank_links', error)],
    };
  }
}

/* -------------------------------------------------------------- expand_hub (IO) */

export async function expandHubNode(state) {
  const hub = state.bestHubUrl ?? state.rankedPages?.[0]?.url;
  if (!hub) return { expansions: 1 };

  try {
    const seen = new Set((state.linkCandidates ?? []).map((link) => link.url));
    const { candidates } = await expandHub(hub, state.company.origin, seen);
    return {
      linkCandidates: candidates,
      expansions: 1,
      notes: [`No obvious hiring page on the homepage, so ${hub} was expanded one level.`],
    };
  } catch (error) {
    return { expansions: 1, errors: [asError('expand_hub', error)] };
  }
}

/* ------------------------------------------------------------- fetch_pages (IO) */

export async function fetchPages(state) {
  const ranked = (state.rankedPages ?? []).slice(0, MAX_PAGES_TO_FETCH);
  if (ranked.length === 0) {
    return {
      notes: ['No candidate pages were found on the company site to read.'],
      researchBranchesDone: 1,
    };
  }

  // Compared canonically: the homepage we already hold as `/` is the same document the
  // site links to as `/index.html`, and fetching it twice wastes a request and puts the
  // same page in pages_used twice.
  const already = new Set((state.pagesFetched ?? []).map((page) => canonicalKey(page.url)));
  const targets = ranked.filter((page) => {
    const key = canonicalKey(page.url);
    return already.has(key) ? false : already.add(key);
  });

  // allSettled, not all: one dead link must not lose the pages that did resolve.
  const settled = await Promise.allSettled(targets.map((page) => fetchPage(page.url)));

  const pagesFetched = [];
  const errors = [];

  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      pagesFetched.push({ ...outcome.value, role: targets[index].role });
    } else {
      errors.push(asError(`fetch_pages:${targets[index].url}`, outcome.reason));
    }
  });

  const notes = errors.length > 0 ? [`${errors.length} company page(s) could not be read and were skipped.`] : [];
  return { pagesFetched, errors, notes, researchBranchesDone: 1 };
}

/* -------------------------------------------------------- search_discussion (IO) */

export async function searchDiscussion(state) {
  const name = state.company?.name;
  if (!name) return { research: { publicDiscussion: null } };

  try {
    const { results } = await searchPublicDiscussion(name);
    if (results.length === 0) {
      return {
        research: { publicDiscussion: null },
        notes: [`No public discussion of ${name}’s interview process was found.`],
      };
    }
    return { research: { publicDiscussionHits: results } };
  } catch (error) {
    return { research: { publicDiscussion: null }, errors: [asError('search_discussion', error)] };
  }
}

/* --------------------------------------------------- summarize_discussion (LLM) */

const discussionSchema = z.object({
  summary: z.string(),
  formats_mentioned: z.array(z.string()),
});

export async function summarizeDiscussion(state) {
  const hits = state.research?.publicDiscussionHits ?? [];
  // Skipped entirely when the search found nothing — no model call, no invented process.
  if (hits.length === 0) return { researchBranchesDone: 1 };

  const listing = hits.map((hit) => `${hit.title}\n${hit.url}\n${hit.snippet}`).join('\n\n');

  try {
    const result = await generateStructured({
      schema: discussionSchema,
      name: 'discussion',
      system:
        'You summarise what public sources say about how a company interviews. Report only ' +
        'what the snippets actually claim, and note that it is unverified public discussion. ' +
        'If the snippets say nothing about interviewing, return an empty summary.',
      user: `What do these search results say about how ${state.company?.name} interviews?\n\n${dataBlock('SEARCH RESULTS', listing, 6000)}`,
    });

    return {
      research: {
        publicDiscussion: {
          summary: result.summary,
          formats: result.formats_mentioned,
          sources: hits.map((hit) => hit.url),
        },
      },
      researchBranchesDone: 1,
    };
  } catch (error) {
    return {
      research: { publicDiscussion: null },
      errors: [asError('summarize_discussion', error)],
      researchBranchesDone: 1,
    };
  }
}

/* ------------------------------------------- await_research (deterministic barrier) */

export const RESEARCH_BRANCH_COUNT = 3;

/**
 * The join for the three research branches. It does nothing but exist: the edge out
 * of it is conditional on all three branches having reported, so the expensive work
 * downstream runs exactly once instead of once per branch.
 */
export function awaitResearch() {
  return {};
}

/* -------------------------------------------------- synthesize_research (LLM) */

const synthesisSchema = z.object({
  // The name the company calls itself, which the URL often cannot tell us — the batch
  // command serves company sites from paths like http://localhost:8099/acme/.
  company_name: z.string().describe('The company name as the pages state it. Empty string if unclear'),
  summary: z.string(),
  what_they_do: z.string(),
  // Empty string, not null — see the note on bestHubUrl. found_hiring_information is
  // the field that actually decides whether we claim to know their process.
  hiring_process: z.string(),
  found_hiring_information: z.boolean(),
});

const SYNTHESIS_SYSTEM = [
  'You write a short factual brief about a company for someone preparing to interview there.',
  '',
  'Ground every sentence in the supplied page text. You must not use outside knowledge about',
  'this company, and you must not infer what they probably do from their name.',
  'If the pages do not say how they hire, set found_hiring_information to false and leave',
  'hiring_process empty. Saying "their site does not describe the process" is a correct,',
  'valuable answer. Inventing a plausible one is a failure.',
].join('\n');

export async function synthesizeResearch(state) {
  const pages = state.pagesFetched ?? [];

  // Nothing was retrieved: say so plainly rather than asking a model to fill the gap.
  if (pages.length === 0) {
    return {
      research: {
        companyBrief: {
          summary: 'The company website could not be retrieved, so no brief could be written.',
          what_they_do: '',
          sources: [],
        },
        hiringProcess: null,
      },
    };
  }

  const corpus = pages
    .map((page) => `URL: ${page.url}\nTITLE: ${page.title}\n${clampText(page.text, 4000)}`)
    .join('\n\n---\n\n');

  try {
    const result = await generateStructured({
      schema: synthesisSchema,
      name: 'company_brief',
      system: SYNTHESIS_SYSTEM,
      user: `Write the brief for ${state.company?.name} from these pages.\n\n${dataBlock('COMPANY PAGES', corpus, 16000)}`,
    });

    const notes = result.found_hiring_information
      ? []
      : ['No hiring or careers information was found on the company site.'];

    return {
      research: {
        companyName: result.company_name?.trim() || null,
        companyBrief: {
          summary: result.summary,
          what_they_do: result.what_they_do,
          sources: pages.map((page) => page.url),
        },
        hiringProcess: result.found_hiring_information ? result.hiring_process : null,
      },
      notes,
    };
  } catch (error) {
    return {
      research: {
        companyBrief: {
          summary: 'The company brief could not be generated.',
          what_they_do: '',
          sources: pages.map((page) => page.url),
        },
        hiringProcess: null,
      },
      errors: [asError('synthesize_research', error)],
    };
  }
}

/* --------------------------------------------------- plan_generation (deterministic) */

const SYSTEM_DESIGN_PATTERN =
  /scal|architect|distributed|microservice|infrastructur|latency|throughput|system design|high availability|data model/i;

/**
 * Deterministic. This is where research actually changes generation rather than
 * merely sitting next to it (.claude/decisions.md): requirements are bucketed per
 * category, weighted by what the hiring page and public discussion actually said.
 */
export function planGeneration(state) {
  const requirements = state.requirements ?? [];

  const hiringText = [
    state.research?.hiringProcess,
    state.research?.publicDiscussion?.summary,
    ...(state.research?.publicDiscussion?.formats ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  const emphasisesSystemDesign = SYSTEM_DESIGN_PATTERN.test(hiringText);
  const emphasisesValues = /values|culture|mission|behavioural|behavioral|leadership/i.test(hiringText);

  const buckets = { technical: [], behavioural: [], 'system-design': [], 'company-fit': [] };

  for (const requirement of requirements) {
    if (requirement.kind === 'behavioural') {
      buckets.behavioural.push(requirement.id);
    } else if (requirement.kind === 'domain') {
      buckets['company-fit'].push(requirement.id);
    } else {
      buckets.technical.push(requirement.id);
      if (SYSTEM_DESIGN_PATTERN.test(requirement.text)) {
        buckets['system-design'].push(requirement.id);
      }
    }
  }

  // The hiring page said they run a design round but no requirement reads that way:
  // pull the heaviest technical must-haves into system-design anyway.
  if (emphasisesSystemDesign && buckets['system-design'].length === 0) {
    buckets['system-design'] = requirements
      .filter((r) => r.kind === 'technical' && r.priority === 'must')
      .slice(0, 2)
      .map((r) => r.id);
  }

  // Company fit is the one category that stands on the brief rather than the JD, so
  // it still gets asked even when no requirement was classified as domain knowledge.
  if (buckets['company-fit'].length === 0) {
    buckets['company-fit'] = requirements.filter((r) => r.priority === 'must').slice(0, 2).map((r) => r.id);
  }

  const counts = {};
  for (const category of QUESTION_CATEGORIES) {
    const size = buckets[category].length;
    let count = size === 0 ? 0 : Math.min(MAX_QUESTIONS_PER_CATEGORY, Math.max(2, Math.ceil(size * 0.8)));
    if (category === 'behavioural' && emphasisesValues && count > 0) count = Math.min(MAX_QUESTIONS_PER_CATEGORY, count + 1);
    if (category === 'system-design' && emphasisesSystemDesign && count > 0) count = Math.min(MAX_QUESTIONS_PER_CATEGORY, count + 1);
    if (category === 'company-fit' && count === 0 && state.research?.companyBrief?.what_they_do) count = 2;
    counts[category] = count;
  }

  return {
    generationPlan: { buckets, counts, emphasisesSystemDesign, emphasisesValues },
    notes: requirements.length === 0 ? ['No requirements were available, so few questions could be generated.'] : [],
  };
}

/* ------------------------------------------------- generate_questions ×4 (LLM) */

const questionBatchSchema = z.object({
  questions: z.array(
    z.object({
      requirement_ids: z.array(z.string()),
      prompt: z.string(),
      answer_outline: z.string().describe('What a strong answer covers, as brief prose or bullets'),
      difficulty: z.number().int().min(1).max(3),
    }),
  ),
});

const CATEGORY_BRIEF = {
  technical: 'hands-on questions about the specific tools, languages and systems named',
  behavioural: 'questions about past behaviour, collaboration and handling difficulty',
  'system-design': 'open design questions about building or scaling a relevant system',
  'company-fit': 'questions about motivation and fit that use what is known about this company',
};

const ID_PREFIX = {
  technical: 'qt',
  behavioural: 'qb',
  'system-design': 'qs',
  'company-fit': 'qc',
};

function questionContext(state) {
  const brief = state.research?.companyBrief;
  const parts = [];
  if (brief?.what_they_do) parts.push(`What they do: ${brief.what_they_do}`);
  if (state.research?.hiringProcess) parts.push(`Their stated hiring process: ${state.research.hiringProcess}`);
  if (state.research?.publicDiscussion?.summary) {
    parts.push(`Unverified public discussion of their process: ${state.research.publicDiscussion.summary}`);
  }
  return parts.join('\n') || 'No company research was available.';
}

/**
 * One call per category, given only that category's requirement subset plus the
 * research — the four run in parallel and each mints ids under its own prefix so the
 * concurrent writes cannot collide.
 */
export function makeQuestionNode(category) {
  return async function generateQuestionsForCategory(state) {
    const plan = state.generationPlan;
    const count = plan?.counts?.[category] ?? 0;
    if (count === 0) return {};

    const ids = new Set(plan.buckets[category]);
    const scoped = (state.requirements ?? []).filter((r) => ids.has(r.id));
    const listing = scoped.map((r) => `${r.id} [${r.priority}] ${r.text}`).join('\n') || '(none)';

    try {
      const result = await generateStructured({
        schema: questionBatchSchema,
        name: `questions_${category.replace('-', '_')}`,
        system: [
          `You write ${category} interview questions: ${CATEGORY_BRIEF[category]}.`,
          '',
          'Each question must cite the ids of the requirements it tests, chosen only from the',
          'list supplied. Do not invent requirement ids. Do not write questions about',
          'technologies the requirements do not mention. difficulty is 1 (warm-up) to 3 (hard).',
        ].join('\n'),
        user: [
          `Write ${count} ${category} questions.`,
          '',
          dataBlock('REQUIREMENTS TO COVER', listing, 4000),
          '',
          dataBlock('COMPANY RESEARCH', questionContext(state), 4000),
        ].join('\n'),
      });

      const knownIds = new Set((state.requirements ?? []).map((r) => r.id));
      const prefix = ID_PREFIX[category];

      const questions = result.questions.slice(0, MAX_QUESTIONS_PER_CATEGORY).map((question, index) => ({
        id: `${prefix}${index + 1}`,
        // A citation to a requirement we never extracted is dropped here rather than
        // being allowed to count as coverage later.
        requirement_ids: (question.requirement_ids ?? []).filter((id) => knownIds.has(id)),
        category,
        prompt: question.prompt,
        answer_outline: question.answer_outline ?? '',
        difficulty: Math.min(3, Math.max(1, Math.round(question.difficulty ?? 2))),
      }));

      return { questions };
    } catch (error) {
      // A failed category is recorded and left to the coverage check, which will see
      // the resulting gap and try again on the second pass.
      return { errors: [asError(`generate_questions:${category}`, error)] };
    }
  };
}

/* ------------------------------------------------------ generate_flashcards (LLM) */

const flashcardBatchSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      requirement_ids: z.array(z.string()),
    }),
  ),
});

export async function generateFlashcards(state) {
  const requirements = state.requirements ?? [];
  if (requirements.length === 0) return { flashcards: [] };

  const listing = requirements.map((r) => `${r.id} [${r.priority}] ${r.text}`).join('\n');

  try {
    const result = await generateStructured({
      schema: flashcardBatchSchema,
      name: 'flashcards',
      system:
        'You write revision flashcards for interview preparation. Front is a short prompt or ' +
        'term; back is a concise, factual answer. Cite only requirement ids from the list.',
      user: [
        `Write up to ${Math.min(12, requirements.length * 2)} flashcards.`,
        '',
        dataBlock('REQUIREMENTS', listing, 4000),
        '',
        dataBlock('COMPANY RESEARCH', questionContext(state), 3000),
      ].join('\n'),
    });

    const knownIds = new Set(requirements.map((r) => r.id));
    const flashcards = result.flashcards.slice(0, 12).map((flashcard, index) => ({
      id: `f${index + 1}`,
      front: flashcard.front,
      back: flashcard.back ?? '',
      requirement_ids: (flashcard.requirement_ids ?? []).filter((id) => knownIds.has(id)),
    }));

    return { flashcards };
  } catch (error) {
    return { flashcards: [], errors: [asError('generate_flashcards', error)] };
  }
}

/* ------------------------------------------------- check_coverage (deterministic) */

/** Set logic only. Never prompted — CLAUDE.md rule 3. */
export function checkCoverageNode(state) {
  const result = checkCoverage({
    requirements: state.requirements ?? [],
    questions: state.questions ?? [],
    previous: state.coverage,
  });

  return { validQuestions: result.questions, coverage: result };
}

/* -------------------------------------------------- generate_gap_questions (LLM) */

export async function generateGapQuestions(state) {
  const coverage = state.coverage;
  const gapIds = [...(coverage?.uncoveredMustIds ?? []), ...coverage.uncovered_requirement_ids].filter(
    (id, index, all) => all.indexOf(id) === index,
  );
  if (gapIds.length === 0) return {};

  const byId = new Map((state.requirements ?? []).map((r) => [r.id, r]));
  const targets = gapIds.slice(0, 8).map((id) => byId.get(id)).filter(Boolean);
  const listing = targets.map((r) => `${r.id} [${r.priority}] ${r.text}`).join('\n');

  try {
    const result = await generateStructured({
      schema: questionBatchSchema,
      name: 'gap_questions',
      system:
        'You write interview questions targeted at requirements that currently have no ' +
        'question against them. Write exactly one question per requirement id listed, and ' +
        'cite that id. Choose the most natural category for each.',
      user: [
        'Write one question for each of these uncovered requirements.',
        '',
        dataBlock('UNCOVERED REQUIREMENTS', listing, 4000),
        '',
        dataBlock('COMPANY RESEARCH', questionContext(state), 3000),
      ].join('\n'),
    });

    const knownIds = new Set(byId.keys());
    const pass = coverage.passes ?? 1;

    const questions = result.questions.map((question, index) => ({
      // Namespaced by pass so a second gap round cannot collide with the first.
      id: `qg${pass}_${index + 1}`,
      requirement_ids: (question.requirement_ids ?? []).filter((id) => knownIds.has(id)),
      category: 'technical',
      prompt: question.prompt,
      answer_outline: question.answer_outline ?? '',
      difficulty: Math.min(3, Math.max(1, Math.round(question.difficulty ?? 2))),
    }));

    return { questions };
  } catch (error) {
    return { errors: [asError('generate_gap_questions', error)] };
  }
}

/* -------------------------------------------------- build_schedule (deterministic) */

/**
 * Deterministic arithmetic (prd §3.8). Also renumbers questions to q1..qn, which is
 * the point at which the per-category prefixes used for safe parallel writes are
 * flattened into the stable ids the kit ships with.
 */
export function buildScheduleNode(state) {
  const source = state.validQuestions ?? state.questions ?? [];

  const finalQuestions = source.map((question, index) => ({ ...question, id: `q${index + 1}` }));

  const schedule = buildSchedule({
    requirements: state.requirements ?? [],
    questions: finalQuestions,
    days: state.input?.days ?? 1,
  });

  return { finalQuestions, schedule };
}

/* --------------------------------------------------- validate_kit (deterministic) */

/** Keeps the first spelling of each page, so provenance reads as the crawler saw it. */
function dedupeByCanonicalUrl(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const key = canonicalKey(url);
    return seen.has(key) ? false : seen.add(key);
  });
}

function assembleKit(state) {
  const role = state.research?.role ?? {};
  const brief = state.research?.companyBrief ?? { summary: '', what_they_do: '', sources: [] };
  const discussionSources = state.research?.publicDiscussion?.sources ?? [];

  return {
    source: {
      // What the pages call the company beats what the URL suggested.
      company: state.research?.companyName || state.company?.name || '',
      company_url: state.company?.normalizedUrl ?? '',
      role: role.title ?? '',
      location: role.location ?? '',
      jd_chars: state.company?.jdChars ?? 0,
      researched_at: new Date().toISOString(),
      pages_used: dedupeByCanonicalUrl((state.pagesFetched ?? []).map((page) => page.url)),
    },
    company_brief: {
      summary: brief.summary ?? '',
      what_they_do: brief.what_they_do ?? '',
      sources: [...new Set([...(brief.sources ?? []), ...discussionSources])],
    },
    role: {
      title: role.title ?? '',
      seniority: role.seniority ?? '',
      responsibilities: role.responsibilities ?? [],
      requirements: state.requirements ?? [],
    },
    questions: (state.finalQuestions ?? []).map(({ id, requirement_ids, category, prompt, answer_outline, difficulty }) => ({
      id,
      requirement_ids,
      category,
      prompt,
      answer_outline,
      difficulty,
    })),
    flashcards: state.flashcards ?? [],
    notes: state.notes ?? [],
    schedule: state.schedule ?? { days_available: state.input?.days ?? 1, days: [] },
    coverage: toCoverageField(state.coverage),
  };
}

export function validateKitNode(state) {
  const kit = assembleKit(state);
  const { ok, issues } = validateKit(kit);

  if (ok) return { kit };
  return { kit, errors: [{ step: 'validate_kit', code: 'KIT_INVALID', message: issues.map((i) => `${i.path}: ${i.message}`).join('; ').slice(0, 300) }] };
}

/* ----------------------------------------------------- repair_kit (deterministic) */

/**
 * One repair attempt, and it is arithmetic rather than a second model call: almost
 * every validation failure here is structural — a dangling id, a day count that drifted,
 * a difficulty outside 1..3. Asking a model to fix those would be slower, cost a call,
 * and risk inventing content, which is the one thing the brief forbids.
 */
export function repairKitNode(state) {
  const kit = structuredClone(state.kit ?? assembleKit(state));

  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));

  const seenQuestionIds = new Set();
  kit.questions = kit.questions
    .filter((question) => {
      if (!question.id || seenQuestionIds.has(question.id)) return false;
      seenQuestionIds.add(question.id);
      return Boolean(question.prompt);
    })
    .map((question) => ({
      ...question,
      requirement_ids: (question.requirement_ids ?? []).filter((id) => requirementIds.has(id)),
      answer_outline: question.answer_outline ?? '',
      difficulty: Math.min(3, Math.max(1, Math.round(Number(question.difficulty) || 2))),
    }));

  const seenFlashcardIds = new Set();
  kit.flashcards = kit.flashcards
    .filter((flashcard) => {
      if (!flashcard.id || seenFlashcardIds.has(flashcard.id)) return false;
      seenFlashcardIds.add(flashcard.id);
      return Boolean(flashcard.front);
    })
    .map((flashcard) => ({
      ...flashcard,
      back: flashcard.back ?? '',
      requirement_ids: (flashcard.requirement_ids ?? []).filter((id) => requirementIds.has(id)),
    }));

  // Rebuilding the schedule from the cleaned question list is both the simplest and
  // the most reliable repair — it restores the exact day count by construction.
  kit.schedule = buildSchedule({
    requirements: kit.role.requirements,
    questions: kit.questions,
    days: state.input?.days ?? kit.schedule?.days_available ?? 1,
  });

  kit.coverage = {
    uncovered_requirement_ids: (kit.coverage?.uncovered_requirement_ids ?? []).filter((id) => requirementIds.has(id)),
    passes: Math.max(0, Math.round(Number(kit.coverage?.passes) || 0)),
  };

  const { ok, issues } = validateKit(kit);
  if (!ok) {
    throw new AppError(
      'KIT_INVALID',
      `Kit failed validation after repair: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
      422,
    );
  }

  return { kit, notes: ['The generated kit needed structural repair before it validated.'] };
}
