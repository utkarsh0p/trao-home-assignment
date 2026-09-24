import { z } from 'zod';

import { buildSchedule } from '../services/schedule.service.js';
import { checkCoverage, toCoverageField } from '../services/coverage.service.js';
import { clampText, dataBlock, generateStructured, isLlmConfigured } from '../lib/llm.js';
import { crawlSite, expandHub } from '../lib/crawler.js';
import { emitActivity, pageLabel, searchOutcome } from '../lib/activity.js';
import { fetchPage } from '../lib/scraper.js';
import { searchPublicDiscussion } from '../lib/search.js';
import { searchResources } from '../lib/resources.js';
import {
  assertFetchable,
  canonicalKey,
  coerceCompanyUrl,
  companyNameFromUrl,
} from '../lib/urlGuard.js';
import { QUESTION_CATEGORIES, SENIORITY_LEVELS } from '../lib/kitSchema.js';
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

/**
 * Every node that does something worth watching reports it, so the progress screen can
 * show work in flight rather than only work that has finished (src/lib/activity.js).
 *
 * `config` is LangGraph's second argument to a node. It is absent when a node is called
 * directly — which regeneration does — and reporting is then a no-op, which is why no
 * call site below has to think about it.
 */
const reporter = (config, node) => (entry) => emitActivity(config, { node, ...entry });

/** The reason a step failed, in the few words the trail has room for. */
const failedDetail = (error) => String(error?.code ?? 'STEP_FAILED');

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
export async function prepare(state, config) {
  const report = reporter(config, 'prepare');
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

    // Only failure is reported. A company URL that worked is not news, and style.md
    // §1.6 is explicit that a passing check renders nothing.
    report({
      kind: 'check',
      label: 'company website',
      status: 'skipped',
      detail: 'no usable URL given',
    });
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
  // A normalised companion to the free-text `seniority` above, which stays because it is
  // what the Role tab shows. planGeneration needs to branch on the level, and branching on
  // free text meant regex-matching the job title — which is how "Software Developer
  // Intern" came to decide, by keyword, that a posting naming SQL had nothing designable
  // in it. The model reads the posting; it can say what level the posting is.
  seniority_level: z
    .enum(SENIORITY_LEVELS)
    .describe('The seniority the posting states, normalised. "unstated" if it does not say'),
  location: z.string().describe('Empty string if the posting does not say'),
  responsibilities: z.array(z.string()),
  requirements: z.array(
    z.object({
      text: z.string().describe('The requirement, in the posting’s own terms'),
      kind: z.enum(['technical', 'behavioural', 'domain']),
      priority: z
        .enum(['must', 'nice'])
        .describe('"must" only if the posting states it as required; "nice" for bonus/preferred'),
      // Which kinds of interview question this requirement could honestly support. This
      // replaces two keyword lists that were making the same judgement badly: a regex
      // cannot tell that "knowledge of relational databases" supports a schema-design
      // question while "own a working laptop" supports nothing at all.
      supports: z
        .array(z.enum(QUESTION_CATEGORIES))
        .describe('Question categories a question about this requirement could be grounded in'),
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
  '- seniority_level is taken from how the POSTING describes the role. Do not infer it from',
  '  the company, and use "unstated" when the posting does not say.',
  '',
  'supports — which kinds of question each requirement could honestly be asked about:',
  '- "technical": hands-on use of a named tool, language or system.',
  '- "behavioural": past behaviour, collaboration, communication, handling difficulty.',
  '- "system-design": an open question about building, structuring or scaling something.',
  '  Tag this ONLY if a design question would be grounded in what the posting actually says,',
  '  AND pitched at the seniority the posting states. Designing table structure for a small',
  '  application suits an intern who is asked for database knowledge; designing a',
  '  multi-region ingestion pipeline does not.',
  '- "company-fit": motivation, values, or why this company specifically.',
  '',
  'A requirement may support several categories, or none. An EMPTY supports array is a',
  'correct and useful answer — "available to commit for three months" and "own a working',
  'laptop" support no interview question at all. Never tag a category merely to fill it:',
  'an empty question category is a true report, and a strained question is not.',
].join('\n');

export async function extractRequirements(state, config) {
  const report = reporter(config, 'extract_requirements');
  const jd = state.input?.jd ?? '';
  report({ kind: 'write', label: 'requirements', status: 'running' });

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
      supports: requirement.supports ?? [],
    }));

    const notes =
      requirements.length === 0
        ? ['No requirements could be extracted from the job description.']
        : [];

    report({
      kind: 'write',
      label: 'requirements',
      status: 'ok',
      detail: `${requirements.length} found`,
    });

    return {
      requirements,
      research: { role: { title: result.title, seniority: result.seniority, seniorityLevel: result.seniority_level, location: result.location, responsibilities: result.responsibilities } },
      notes,
      researchBranchesDone: 1,
    };
  } catch (error) {
    report({ kind: 'write', label: 'requirements', status: 'failed', detail: failedDetail(error) });
    return {
      requirements: [],
      errors: [asError('extract_requirements', error)],
      notes: ['Requirement extraction failed, so this kit has no requirement list.'],
      researchBranchesDone: 1,
    };
  }
}

/* ------------------------------------------------------------- crawl_site (IO) */

export async function crawlSiteNode(state, config) {
  const report = reporter(config, 'crawl_site');
  const url = state.company?.normalizedUrl;
  if (!url) return {};

  const homepage = { kind: 'page', url, label: pageLabel('home') };
  report({ ...homepage, status: 'running' });

  try {
    const { seedPage, candidates } = await crawlSite(url);
    report({
      ...homepage,
      status: 'ok',
      detail: seedPage.title ? String(seedPage.title).slice(0, 80) : `${candidates.length} links`,
    });
    return {
      linkCandidates: candidates,
      pagesFetched: [{ ...seedPage, role: 'home' }],
    };
  } catch (error) {
    // The error's step name carries no URL, so before this the trail showed nothing at
    // all for a homepage that could not be read — the one failure worth seeing most.
    report({ ...homepage, status: 'failed', detail: failedDetail(error) });
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

export async function rankLinks(state, config) {
  const report = reporter(config, 'rank_links');
  const queue = (pages) => {
    for (const page of pages) {
      report({ kind: 'page', url: page.url, label: pageLabel(page.role), status: 'queued' });
    }
  };

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

    queue(ranked.slice(0, MAX_PAGES_TO_FETCH));

    return {
      rankedPages: ranked,
      hiringPageConfidence: result.hiringPageConfidence,
      bestHubUrl: known.has(result.bestHubUrl) ? result.bestHubUrl : null,
    };
  } catch (error) {
    // Fall back to the raw candidate order rather than abandoning the crawl.
    const fallback = candidates.slice(0, MAX_PAGES_TO_FETCH).map((link) => ({
      url: link.url,
      role: 'other',
      confidence: 0.2,
    }));
    queue(fallback);

    return { rankedPages: fallback, errors: [asError('rank_links', error)] };
  }
}

/* -------------------------------------------------------------- expand_hub (IO) */

export async function expandHubNode(state, config) {
  const report = reporter(config, 'expand_hub');
  const hub = state.bestHubUrl ?? state.rankedPages?.[0]?.url;
  if (!hub) return { expansions: 1 };

  const row = { kind: 'page', url: hub, label: 'hub' };
  report({ ...row, status: 'running' });

  try {
    const seen = new Set((state.linkCandidates ?? []).map((link) => link.url));
    const { candidates } = await expandHub(hub, state.company.origin, seen);
    report({ ...row, status: 'ok', detail: `${candidates.length} more links` });
    return {
      linkCandidates: candidates,
      expansions: 1,
      notes: [`No obvious hiring page on the homepage, so ${hub} was expanded one level.`],
    };
  } catch (error) {
    report({ ...row, status: 'failed', detail: failedDetail(error) });
    return { expansions: 1, errors: [asError('expand_hub', error)] };
  }
}

/* ------------------------------------------------------------- fetch_pages (IO) */

export async function fetchPages(state, config) {
  const report = reporter(config, 'fetch_pages');

  const ranked = (state.rankedPages ?? []).slice(0, MAX_PAGES_TO_FETCH);
  if (ranked.length === 0) {
    report({
      kind: 'check',
      label: 'other pages',
      status: 'skipped',
      detail: 'no candidates on the site',
    });
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
  const settled = await Promise.allSettled(
    targets.map((page) => {
      report({ kind: 'page', url: page.url, label: pageLabel(page.role), status: 'running' });
      return fetchPage(page.url);
    }),
  );

  const pagesFetched = [];
  const errors = [];

  settled.forEach((outcome, index) => {
    const row = {
      kind: 'page',
      url: targets[index].url,
      label: pageLabel(targets[index].role),
    };

    if (outcome.status === 'fulfilled') {
      pagesFetched.push({ ...outcome.value, role: targets[index].role });
      report({
        ...row,
        status: 'ok',
        detail: outcome.value.title ? String(outcome.value.title).slice(0, 80) : '',
      });
    } else {
      errors.push(asError(`fetch_pages:${targets[index].url}`, outcome.reason));
      report({ ...row, status: 'failed', detail: failedDetail(outcome.reason) });
    }
  });

  const notes = errors.length > 0 ? [`${errors.length} company page(s) could not be read and were skipped.`] : [];
  return { pagesFetched, errors, notes, researchBranchesDone: 1 };
}

/* -------------------------------------------------------- search_discussion (IO) */

export async function searchDiscussion(state, config) {
  const report = reporter(config, 'search_discussion');
  const name = state.company?.name;
  if (!name) return { research: { publicDiscussion: null } };

  const row = { kind: 'search', label: 'public discussion' };
  // Reported before the await, not after it. A Tavily call is two queries against a 15s
  // timeout; until this line existed the row appeared only once it was over, already
  // carrying an outcome — which is how a search still in flight came to read
  // "nothing usable found".
  report({ ...row, status: 'running', detail: `searching for ${name}` });

  try {
    const { results, failed, error, configured } = await searchPublicDiscussion(name);
    report({ ...row, ...searchOutcome({ configured, failed, results }) });

    // Nothing failed and nothing was searched: there is no provider set up. That is a
    // gap in our configuration, and belongs in notes beside the other honest gaps —
    // not in researchErrors, which is for things that broke.
    if (!configured) {
      return {
        research: { publicDiscussion: null },
        notes: [
          `No web search provider is configured, so this kit has no research into how ${name} interviews. That is a gap in our setup, not evidence that none exists.`,
        ],
      };
    }

    // "We looked and there is nothing" and "we could not look" are different facts, and
    // the kit must not report the second as the first. The old code collapsed them, so
    // every kit claimed nothing was found even when the search never ran.
    if (failed) {
      return {
        research: { publicDiscussion: null },
        errors: [asError('search_discussion', { code: 'SEARCH_UNAVAILABLE', message: error })],
        notes: [
          `The web search for public discussion of ${name}’s interview process could not be run, so this kit has none. That is a gap in our research, not evidence that none exists.`,
        ],
      };
    }

    if (results.length === 0) {
      return {
        research: { publicDiscussion: null },
        notes: [`No public discussion of ${name}’s interview process was found.`],
      };
    }

    return { research: { publicDiscussionHits: results } };
  } catch (error) {
    report({ ...row, status: 'failed', detail: 'search unavailable' });
    return {
      research: { publicDiscussion: null },
      errors: [asError('search_discussion', error)],
      notes: [
        `The web search for public discussion of ${name}’s interview process could not be run, so this kit has none.`,
      ],
    };
  }
}

/* --------------------------------------------------- summarize_discussion (LLM) */

const discussionSchema = z.object({
  summary: z.string(),
  formats_mentioned: z.array(z.string()),
  // The same list, mapped onto the categories we actually generate. planGeneration used to
  // read this by running a keyword regex over the joined summary text; asking the model
  // that is already reading the snippets costs nothing and cannot miss a round because it
  // was described in words we had not thought of.
  question_categories_mentioned: z
    .array(z.enum(QUESTION_CATEGORIES))
    .describe('Which of these kinds of interview the sources say this company runs. Empty if they do not say'),
});

export async function summarizeDiscussion(state, config) {
  const report = reporter(config, 'summarize_discussion');
  const hits = state.research?.publicDiscussionHits ?? [];
  // Skipped entirely when the search found nothing — no model call, no invented process.
  if (hits.length === 0) return { researchBranchesDone: 1 };

  const row = { kind: 'write', label: 'how they interview' };
  report({ ...row, status: 'running' });

  const listing = hits.map((hit) => `${hit.title}\n${hit.url}\n${hit.snippet}`).join('\n\n');

  try {
    const result = await generateStructured({
      schema: discussionSchema,
      name: 'discussion',
      system: [
        'You summarise what public sources say about how a company interviews.',
        '',
        'Rules you must follow exactly:',
        '- Report only what the snippets actually claim, and note that it is unverified',
        '  public discussion.',
        '- A web search returns the closest matches it can find, which for a small or',
        '  obscure company are often about a DIFFERENT company with a similar name.',
        '  Ignore any snippet that is not clearly about the company named below.',
        '- If nothing left is about that company, or the snippets say nothing about',
        '  interviewing, return an empty summary. An empty summary is the correct,',
        '  useful answer — a plausible process invented from the wrong company is worse',
        '  than saying nothing.',
      ].join('\n'),
      user: `What do these search results say about how ${state.company?.name} interviews? Ignore any result that is about a different company.\n\n${dataBlock('SEARCH RESULTS', listing, 6000)}`,
    });

    // An empty summary is the model correctly refusing to invent a process from results
    // about the wrong company. Treat it as "nothing found" rather than attaching a blank
    // section and a list of irrelevant sources to the kit.
    if (!result.summary.trim()) {
      report({
        ...row,
        status: 'skipped',
        detail: `nothing about ${state.company?.name}`,
      });
      return {
        research: { publicDiscussion: null },
        notes: [
          `Public discussion of ${state.company?.name}’s interview process was searched for, but nothing found was actually about them.`,
        ],
        researchBranchesDone: 1,
      };
    }

    report({ ...row, status: 'ok', detail: `${hits.length} source${hits.length === 1 ? '' : 's'} read` });

    return {
      research: {
        publicDiscussion: {
          summary: result.summary,
          formats: result.formats_mentioned,
          categories: result.question_categories_mentioned ?? [],
          sources: hits.map((hit) => hit.url),
        },
      },
      researchBranchesDone: 1,
    };
  } catch (error) {
    report({ ...row, status: 'failed', detail: failedDetail(error) });
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
  // Which of the categories we generate their published process actually names. Empty
  // unless the pages say so — the same discipline found_hiring_information already carries.
  question_categories_mentioned: z
    .array(z.enum(QUESTION_CATEGORIES))
    .describe('Which of these kinds of interview their pages say they run. Empty if the pages do not say'),
});

const SYNTHESIS_SYSTEM = [
  'You write a short factual brief about a company for someone preparing to interview there.',
  '',
  'Ground every sentence in the supplied page text. You must not use outside knowledge about',
  'this company, and you must not infer what they probably do from their name.',
  'If the pages do not say how they hire, set found_hiring_information to false, leave',
  'hiring_process empty and return an empty question_categories_mentioned. Saying "their',
  'site does not describe the process" is a correct, valuable answer. Inventing a plausible',
  'one is a failure, and so is guessing which rounds they probably run.',
].join('\n');

export async function synthesizeResearch(state, config) {
  const report = reporter(config, 'synthesize_research');
  const pages = state.pagesFetched ?? [];

  // Nothing was retrieved: say so plainly rather than asking a model to fill the gap.
  if (pages.length === 0) {
    report({ kind: 'write', label: 'company brief', status: 'skipped', detail: 'no pages to read' });
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

  const brief = { kind: 'write', label: 'company brief' };
  report({ ...brief, status: 'running', detail: `reading ${pages.length} page${pages.length === 1 ? '' : 's'}` });

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

    report({
      ...brief,
      status: 'ok',
      detail: result.found_hiring_information ? 'their process found' : 'no process published',
    });

    return {
      research: {
        companyName: result.company_name?.trim() || null,
        companyBrief: {
          summary: result.summary,
          what_they_do: result.what_they_do,
          sources: pages.map((page) => page.url),
        },
        hiringProcess: result.found_hiring_information ? result.hiring_process : null,
        hiringCategories: result.found_hiring_information
          ? (result.question_categories_mentioned ?? [])
          : [],
      },
      notes,
    };
  } catch (error) {
    report({ ...brief, status: 'failed', detail: failedDetail(error) });
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

/**
 * Deterministic. This is where research actually changes generation rather than merely
 * sitting next to it (.claude/decisions.md).
 *
 * It used to decide by keyword: three regexes — one for "designable" requirement text, one
 * for system-design language, one for junior/senior job titles — stood in for a judgement
 * about what a posting is asking for. They were wrong in both directions. "Software
 * Developer Intern" matched the junior pattern and hard-blocked the category, so a posting
 * that named SQL and relational databases produced zero design questions; meanwhile a
 * posting saying nothing designable could pick some up from the company's hiring page.
 *
 * So the division of labour is now the one the rest of the pipeline already uses: the
 * model, which is reading the posting anyway, tags each requirement with the categories it
 * could honestly support and names the seniority the posting states. This function does
 * arithmetic over those tags — bucket, count, cap. No text is interpreted here, which is
 * why it stays pure, deterministic and unit-testable.
 */
export function planGeneration(state) {
  const requirements = state.requirements ?? [];
  const role = state.research?.role ?? {};

  const level = SENIORITY_LEVELS.includes(role.seniorityLevel) ? role.seniorityLevel : 'unstated';
  const junior = level === 'intern' || level === 'junior';
  const senior = level === 'senior' || level === 'staff';

  // What the company's own pages and the public discussion say they actually run, as
  // categories rather than as prose to be scanned.
  const researched = new Set([
    ...(state.research?.hiringCategories ?? []),
    ...(state.research?.publicDiscussion?.categories ?? []),
  ]);

  /**
   * Is this kit tagged at all?
   *
   * An empty `supports` on one requirement is meaningful — the model read "available to
   * commit for three months" and correctly judged that it supports no interview question.
   * But a kit written before tagging existed has empty arrays on every requirement, and
   * both the Zod and Mongoose schemas default the field to `[]`, so "absent" does not
   * survive a round trip through validation. Reading the two apart per requirement would
   * therefore silently empty every bucket on an older kit.
   *
   * Decide once, for the whole set: if nothing anywhere carries a tag, this kit predates
   * tagging and buckets by `kind` — the same model-assigned signal one step coarser, never
   * keyword matching. If anything does, the tags are trusted, empty ones included.
   */
  const tagged = requirements.some((r) => r.supports?.length > 0);

  const supportsOf = (requirement) => {
    if (tagged) return requirement.supports ?? [];
    if (requirement.kind === 'behavioural') return ['behavioural'];
    if (requirement.kind === 'domain') return ['company-fit'];
    return ['technical'];
  };

  const buckets = Object.fromEntries(QUESTION_CATEGORIES.map((category) => [category, []]));
  for (const requirement of requirements) {
    for (const category of supportsOf(requirement)) {
      if (buckets[category]) buckets[category].push(requirement.id);
    }
  }

  // Company fit is the one category that stands on the brief rather than the JD, so it is
  // still asked when no requirement was tagged for it. That is a structural fact about the
  // category — you can always ask why this company — not a rule about any posting's words.
  if (buckets['company-fit'].length === 0) {
    buckets['company-fit'] = requirements.filter((r) => r.priority === 'must').slice(0, 2).map((r) => r.id);
  }

  // Research can add weight to a category the posting already supports. It can no longer
  // create one from nothing: a company that runs a design round does not make an intern
  // posting about laptops into something worth designing.
  const emphasisesSystemDesign =
    buckets['system-design'].length > 0 && (senior || researched.has('system-design'));
  const emphasisesValues = researched.has('behavioural') || researched.has('company-fit');

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
    generationPlan: { buckets, counts, emphasisesSystemDesign, emphasisesValues, senior, junior, level },
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
 * The research a flashcard may draw on. Wider than questionContext on purpose: it keeps
 * `brief.summary`, which is where the quotable specifics live — "founded in 2016",
 * "about ninety people", "four million tracking events a day". Those are exactly the
 * facts worth having at your fingertips walking in, and the narrower context dropped
 * them, leaving the model nothing to write about except the requirement list.
 */
function flashcardContext(state) {
  const brief = state.research?.companyBrief;
  const parts = [];
  if (brief?.summary) parts.push(`About them: ${brief.summary}`);
  if (brief?.what_they_do) parts.push(`What they do: ${brief.what_they_do}`);
  if (state.research?.hiringProcess) {
    parts.push(`Their stated hiring process: ${state.research.hiringProcess}`);
  }
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
  return async function generateQuestionsForCategory(state, config) {
    const report = reporter(config, `generate_questions_${category.replace('-', '_')}`);
    const row = { kind: 'write', label: category };

    const plan = state.generationPlan;
    const count = plan?.counts?.[category] ?? 0;
    // A category the planner zeroed is a decision, and worth seeing: it means nothing in
    // the posting could honestly ground a question of this kind.
    if (count === 0) {
      report({ ...row, status: 'skipped', detail: 'nothing to ground it in' });
      return {};
    }

    report({ ...row, status: 'running' });

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

      report({ ...row, status: 'ok', detail: `${questions.length} written` });

      return { questions };
    } catch (error) {
      // A failed category is recorded and left to the coverage check, which will see
      // the resulting gap and try again on the second pass.
      report({ ...row, status: 'failed', detail: failedDetail(error) });
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

/**
 * A back that hedges instead of answering. The model reaches for these when the material
 * does not support the card it started writing; the prompt tells it to omit such a card,
 * and this drops the ones that slip through. Cheap, deterministic, and it caught a real
 * shipped card whose back read "The provided company research does not contain
 * information about Python usage".
 */
const HEDGE = [
  /does not (contain|specify|mention|provide|include)/i,
  /(is|are|was|were) not (specified|mentioned|provided|stated|available|given)/i,
  /no (information|details?|mention) (about|on|regarding|of)/i,
  /(research|posting|description|material) does not/i,
  /not enough (information|detail)/i,
  /unable to determine/i,
];

const hedges = (text) => HEDGE.some((pattern) => pattern.test(text));

export async function generateFlashcards(state, config) {
  const report = reporter(config, 'generate_flashcards');
  const row = { kind: 'write', label: 'flashcards' };

  const requirements = state.requirements ?? [];
  if (requirements.length === 0) {
    report({ ...row, status: 'skipped', detail: 'no requirements to write from' });
    return { flashcards: [] };
  }

  report({ ...row, status: 'running' });

  const listing = requirements.map((r) => `${r.id} [${r.priority}] ${r.text}`).join('\n');

  try {
    const result = await generateStructured({
      schema: flashcardBatchSchema,
      name: 'flashcards',
      system: [
        'You write flashcards for someone preparing for one specific interview. A flashcard',
        'tests something they must be able to RECALL in the room: a definition, a mechanism,',
        'a trade-off, a number, or a fact about how this company works and hires.',
        '',
        'Never write a card whose answer restates the posting. "Front: Kubernetes Experience /',
        'Back: The role requires Kubernetes in production" is not a flashcard — the candidate',
        'already knows what the posting said, and reading it back teaches them nothing. Ask',
        'what they must KNOW: "What does a failing readiness probe do to traffic routing?"',
        '',
        'Write two kinds of card:',
        '  1. Company and process cards, drawn only from the research block — what they build,',
        '     how they interview, what their take-home involves. Cite no requirement id if',
        '     none genuinely applies; an empty list is correct and better than a wrong id.',
        '  2. Technical recall cards. Use a listed topic only to CHOOSE the subject; the answer',
        '     must be real knowledge about that subject, not the words of the posting.',
        '',
        'Do not aim for one card per topic. Cover a topic twice if it deserves it, and skip any',
        'topic you cannot write a concrete answer for. Omit a card rather than hedging — never',
        'write a back saying the material does not cover something. Fewer real cards is correct;',
        'padding the deck is not.',
      ].join('\n'),
      user: [
        `Write up to ${Math.min(12, requirements.length * 2)} flashcards.`,
        '',
        dataBlock('TOPICS THE POSTING NAMES', listing, 4000),
        '',
        dataBlock('COMPANY RESEARCH', flashcardContext(state), 3000),
      ].join('\n'),
    });

    const knownIds = new Set(requirements.map((r) => r.id));

    // Ids are minted after filtering so they stay dense.
    const flashcards = result.flashcards
      .filter((flashcard) => {
        const front = flashcard.front?.trim();
        const back = flashcard.back?.trim();
        return front && back && !hedges(back);
      })
      .slice(0, 12)
      .map((flashcard, index) => ({
        id: `f${index + 1}`,
        front: flashcard.front,
        back: flashcard.back,
        requirement_ids: (flashcard.requirement_ids ?? []).filter((id) => knownIds.has(id)),
      }));

    report({ ...row, status: 'ok', detail: `${flashcards.length} written` });

    return { flashcards };
  } catch (error) {
    report({ ...row, status: 'failed', detail: failedDetail(error) });
    return { flashcards: [], errors: [asError('generate_flashcards', error)] };
  }
}

/* ---------------------------------------------------------- find_resources (IO) */

/**
 * Things to watch and read, one search per category the kit actually asks about.
 *
 * No model call: the queries are built from the role title and the hits are filtered by
 * rule (src/lib/resources.js), so a kit gains real links or none. Runs beside the five
 * generation calls, which means it is free in wall-clock terms, and it reads only what
 * plan_generation already decided — a category nobody is writing questions for is a
 * category nobody needs a video for either.
 */
export async function findResources(state, config) {
  const report = reporter(config, 'find_resources');
  const role = state.research?.role?.title ?? '';
  const counts = state.generationPlan?.counts ?? {};
  const wanted = QUESTION_CATEGORIES.filter((category) => (counts[category] ?? 0) > 0);

  if (!role || wanted.length === 0) return { resources: [] };

  const row = { kind: 'write', label: 'things to watch and read' };
  report({ ...row, status: 'running', detail: `${wanted.length} categories` });

  try {
    const { resources, configured } = await searchResources(role, wanted);

    if (!configured) {
      // The same distinction the public-discussion search keeps: we did not look is not
      // the same fact as there is nothing to find.
      report({ ...row, status: 'skipped', detail: 'no search provider configured' });
      return {
        resources: [],
        notes: [
          'No web search provider is configured, so this kit has no curated videos or articles. That is a gap in our setup, not evidence that none exist.',
        ],
      };
    }

    report({
      ...row,
      status: 'ok',
      detail: resources.length === 0 ? 'nothing found' : `${resources.length} found`,
    });

    return { resources };
  } catch (error) {
    report({ ...row, status: 'failed', detail: failedDetail(error) });
    return { resources: [], errors: [asError('find_resources', error)] };
  }
}

/* ------------------------------------------------- check_coverage (deterministic) */

/** Set logic only. Never prompted — CLAUDE.md rule 3. */
export function checkCoverageNode(state, config) {
  const result = checkCoverage({
    requirements: state.requirements ?? [],
    questions: state.questions ?? [],
    previous: state.coverage,
  });

  // One row for the whole loop, rewritten on each pass rather than stacked, so the
  // second pass reads as the same check running again. Reporting a number the set logic
  // above already produced is not the same as asking anyone to compute it.
  const gaps = result.uncovered_requirement_ids?.length ?? 0;
  emitActivity(config, {
    node: 'check_coverage',
    kind: 'check',
    label: 'requirement coverage',
    status: 'ok',
    detail: `pass ${result.passes ?? 1} — ${gaps === 0 ? 'every requirement covered' : `${gaps} uncovered`}`,
  });

  return { validQuestions: result.questions, coverage: result };
}

/* -------------------------------------------------- generate_gap_questions (LLM) */

export async function generateGapQuestions(state, config) {
  const report = reporter(config, 'generate_gap_questions');
  const row = { kind: 'write', label: 'questions for the gaps' };
  const coverage = state.coverage;
  const gapIds = [...(coverage?.uncoveredMustIds ?? []), ...coverage.uncovered_requirement_ids].filter(
    (id, index, all) => all.indexOf(id) === index,
  );
  if (gapIds.length === 0) return {};

  report({ ...row, status: 'running', detail: `${gapIds.length} to close` });

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

    report({ ...row, status: 'ok', detail: `${questions.length} written` });

    return { questions };
  } catch (error) {
    report({ ...row, status: 'failed', detail: failedDetail(error) });
    return { errors: [asError('generate_gap_questions', error)] };
  }
}

/* -------------------------------------------------- build_schedule (deterministic) */

/**
 * Deterministic arithmetic (prd §3.8). Also renumbers questions to q1..qn, which is
 * the point at which the per-category prefixes used for safe parallel writes are
 * flattened into the stable ids the kit ships with.
 */
export function buildScheduleNode(state, config) {
  const source = state.validQuestions ?? state.questions ?? [];

  const finalQuestions = source.map((question, index) => ({ ...question, id: `q${index + 1}` }));

  // Flashcards already carry their stable f1..fn ids (generateFlashcards) and the graph
  // joins that branch at check_coverage, so they are in state before this node runs.
  const schedule = buildSchedule({
    requirements: state.requirements ?? [],
    questions: finalQuestions,
    flashcards: state.flashcards ?? [],
    resources: state.resources ?? [],
    days: state.input?.days ?? 1,
  });

  const minutes = schedule.days.reduce((total, day) => total + (day.minutes ?? 0), 0);
  emitActivity(config, {
    node: 'build_schedule',
    kind: 'check',
    label: 'study plan',
    status: 'ok',
    detail: `${schedule.days.length} day${schedule.days.length === 1 ? '' : 's'}, ${minutes} minutes`,
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
      seniority_level: role.seniorityLevel ?? 'unstated',
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
    resources: state.resources ?? [],
    notes: state.notes ?? [],
    schedule: state.schedule ?? { days_available: state.input?.days ?? 1, days: [] },
    coverage: toCoverageField(state.coverage),
  };
}

export function validateKitNode(state, config) {
  const kit = assembleKit(state);
  const { ok, issues } = validateKit(kit);

  emitActivity(config, {
    node: 'validate_kit',
    kind: 'check',
    label: 'kit structure',
    status: ok ? 'ok' : 'failed',
    detail: ok ? 'valid' : `${issues.length} problem${issues.length === 1 ? '' : 's'} to repair`,
  });

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
export function repairKitNode(state, config) {
  const report = reporter(config, 'repair_kit');
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

  // Same treatment as questions and cards: anything that cannot be rendered as a link
  // is dropped, so the rebuild below cannot schedule a resource that does not resolve.
  const seenResourceIds = new Set();
  kit.resources = (kit.resources ?? [])
    .filter((resource) => {
      if (!resource?.id || seenResourceIds.has(resource.id)) return false;
      seenResourceIds.add(resource.id);
      return Boolean(resource.url && resource.title);
    })
    .map((resource) => ({
      ...resource,
      source: resource.source ?? '',
      thumbnail: resource.thumbnail ?? '',
    }));

  // Rebuilding the schedule from the cleaned question list is both the simplest and
  // the most reliable repair — it restores the exact day count by construction.
  // Rebuilt from the CLEANED lists, not the originals: repair has just dropped
  // malformed questions and cards, and feeding the originals back would reintroduce
  // exactly the dangling ids the validate step is about to reject.
  kit.schedule = buildSchedule({
    requirements: kit.role.requirements,
    questions: kit.questions,
    flashcards: kit.flashcards,
    resources: kit.resources,
    days: state.input?.days ?? kit.schedule?.days_available ?? 1,
  });

  kit.coverage = {
    uncovered_requirement_ids: (kit.coverage?.uncovered_requirement_ids ?? []).filter((id) => requirementIds.has(id)),
    passes: Math.max(0, Math.round(Number(kit.coverage?.passes) || 0)),
  };

  const { ok, issues } = validateKit(kit);
  if (!ok) {
    report({ kind: 'check', label: 'kit structure', status: 'failed', detail: 'could not be repaired' });
    throw new AppError(
      'KIT_INVALID',
      `Kit failed validation after repair: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
      422,
    );
  }

  report({ kind: 'check', label: 'kit structure', status: 'ok', detail: 'repaired' });

  return { kit, notes: ['The generated kit needed structural repair before it validated.'] };
}
