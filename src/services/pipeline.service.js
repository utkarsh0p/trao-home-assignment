import { RECURSION_LIMIT, getGraph } from '../graph/index.js';
import {
  generateFlashcards,
  makeQuestionNode,
  planGeneration,
  synthesizeResearch,
} from '../graph/nodes.js';
import { buildSchedule } from './schedule.service.js';
import { fetchPage } from '../lib/scraper.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Runs the full research → generation → validation path for one case.
 *
 * This is the single implementation. `src/cli/evaluate.js` and the HTTP job runner
 * both call it; a parallel batch path is explicitly disqualifying (CLAUDE.md rule 7).
 */

/**
 * @param {string}   jd          the pasted job description
 * @param {string}   companyUrl  the company website
 * @param {number}   days        how many days until the interview
 * @param {function} onStep      called with each completed node name, for progress
 * @returns {{ kit, notes, errors }} kit is exactly the Appendix A structure
 */
export async function runPipeline({ jd, companyUrl, days, caseId = null, onStep = null }) {
  const graph = getGraph();

  const input = { input: { jd, companyUrl, days, caseId } };
  let finalState = null;

  // 'updates' gives us the node that just finished (progress); 'values' gives the
  // accumulated state, whose last emission is the finished run.
  const stream = await graph.stream(input, {
    streamMode: ['updates', 'values'],
    recursionLimit: RECURSION_LIMIT,
  });

  for await (const [mode, chunk] of stream) {
    if (mode === 'updates') {
      const step = Object.keys(chunk)[0];
      // Progress reporting must never take down the run it is reporting on.
      if (onStep && step) await Promise.resolve(onStep(step)).catch(() => {});
    } else {
      finalState = chunk;
    }
  }

  if (!finalState?.kit) {
    throw new AppError('PIPELINE_FAILED', 'The pipeline finished without producing a kit.', 500);
  }

  return {
    kit: finalState.kit,
    notes: finalState.notes ?? [],
    errors: finalState.errors ?? [],
  };
}

/* ------------------------------------------------------------------ regeneration */

/**
 * Rebuilds the state a single node needs from a kit that already exists, so
 * regenerating one section runs the same code the original generation ran rather than
 * a second, subtly different implementation.
 */
function stateFromKit(kitDoc) {
  const requirements = kitDoc.role.requirements.map((r) => ({
    id: r.id,
    text: r.text,
    kind: r.kind,
    priority: r.priority,
  }));

  return {
    input: { days: kitDoc.schedule.days_available },
    company: {
      name: kitDoc.source.company,
      normalizedUrl: kitDoc.source.company_url,
      jdChars: kitDoc.source.jd_chars,
    },
    requirements,
    research: {
      companyBrief: {
        summary: kitDoc.company_brief.summary,
        what_they_do: kitDoc.company_brief.what_they_do,
        sources: kitDoc.company_brief.sources,
      },
      hiringProcess: null,
      role: {
        title: kitDoc.role.title,
        seniority: kitDoc.role.seniority,
        location: kitDoc.source.location,
        responsibilities: kitDoc.role.responsibilities,
      },
    },
  };
}

/**
 * Produces fresh content for one section. Returns the payload in the shape
 * kit.service.applyRegeneratedSection expects — it does not decide what to keep;
 * that judgement belongs with the origin/pinned rules in the kit service.
 */
export async function regenerateSection(kitDoc, section) {
  const state = stateFromKit(kitDoc);

  // The schedule is arithmetic. Regenerating it is a recomputation, not a model call,
  // and it calls buildSchedule directly rather than the graph node, because the node
  // renumbers question ids and an existing kit's ids must survive untouched.
  if (section === 'schedule') {
    return buildSchedule({
      requirements: state.requirements,
      questions: kitDoc.questions.map((q) => ({
        id: q.id,
        requirement_ids: q.requirement_ids,
        category: q.category,
        difficulty: q.difficulty,
      })),
      days: kitDoc.schedule.days_available,
    });
  }

  if (section === 'company_brief') {
    // The brief is grounded in page text, so the pages have to be read again. The
    // fetch cache usually makes this nearly free.
    const settled = await Promise.allSettled(
      (kitDoc.source.pages_used ?? []).slice(0, 4).map((url) => fetchPage(url)),
    );
    const pagesFetched = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);

    const result = await synthesizeResearch({ ...state, pagesFetched });
    const brief = result.research?.companyBrief;
    if (!brief) throw new AppError('REGENERATION_FAILED', 'Could not rewrite the brief.', 502);

    return { summary: brief.summary, what_they_do: brief.what_they_do, sources: brief.sources };
  }

  if (section === 'flashcards') {
    const result = await generateFlashcards(state);
    return (result.flashcards ?? []).map(({ front, back, requirement_ids }) => ({
      front,
      back,
      requirement_ids,
    }));
  }

  // A question category: run that one category node, with the planner deciding how
  // many and against which requirements, exactly as in a full run.
  const { generationPlan } = planGeneration(state);
  const result = await makeQuestionNode(section)({ ...state, generationPlan });

  return (result.questions ?? []).map(
    ({ requirement_ids, category, prompt, answer_outline, difficulty }) => ({
      requirement_ids,
      category,
      prompt,
      answer_outline,
      difficulty,
    }),
  );
}
