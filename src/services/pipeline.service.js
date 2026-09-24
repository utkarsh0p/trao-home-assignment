import { RECURSION_LIMIT, getGraph } from '../graph/index.js';
import {
  generateFlashcards,
  makeQuestionNode,
  planGeneration,
  synthesizeResearch,
} from '../graph/nodes.js';
import { buildSchedule } from './schedule.service.js';
import { mergeActivity } from '../lib/activity.js';
import { deriveTrail } from '../lib/researchTrail.js';
import { fetchPage } from '../lib/scraper.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Runs the full research → generation → validation path for one case.
 *
 * This is the single implementation. `src/cli/evaluate.js` and the HTTP job runner
 * both call it; a parallel batch path is explicitly disqualifying (CLAUDE.md rule 7).
 */

/**
 * How long activity emissions are allowed to pile up before they are written. The client
 * polls every 1500ms, so 400ms is indistinguishable from live and bounds a 40s run to
 * about a hundred writes instead of one per emission.
 */
const ACTIVITY_FLUSH_MS = 400;

/**
 * @param {string}   jd          the pasted job description
 * @param {string}   companyUrl  the company website
 * @param {number}   days        how many days until the interview
 * @param {function} onStep      called with (nodeName, trail) as each node completes
 * @param {function} onActivity  called with (trail, nodeName) as work happens inside a
 *                               node — debounced. Omit it and nothing is streamed at all.
 * @returns {{ kit, notes, errors }} kit is exactly the Appendix A structure
 */
export async function runPipeline({
  jd,
  companyUrl,
  days,
  caseId = null,
  onStep = null,
  onActivity = null,
}) {
  const graph = getGraph();

  const input = { input: { jd, companyUrl, days, caseId } };
  let finalState = null;

  // 'updates' gives us the node that just finished; 'values' gives the accumulated
  // state, whose last emission is the finished run; 'custom' carries what the nodes
  // report about themselves while they are still running, which is the only way a row
  // can ever say "doing this now". Asked for only when somebody is listening, so the
  // batch pays nothing for it.
  const stream = await graph.stream(input, {
    streamMode: onActivity ? ['updates', 'values', 'custom'] : ['updates', 'values'],
    recursionLimit: RECURSION_LIMIT,
  });

  const trail = [];
  let lastStep = 'starting';
  let flushTimer = null;

  const cancelFlush = () => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  // Progress reporting must never take down the run it is reporting on.
  const flush = () => {
    cancelFlush();
    if (!onActivity || trail.length === 0) return;
    Promise.resolve(onActivity([...trail], lastStep)).catch(() => {});
  };

  const armFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, ACTIVITY_FLUSH_MS);
    flushTimer.unref?.();
  };

  for await (const [mode, chunk] of stream) {
    if (mode === 'custom') {
      mergeActivity(trail, chunk);
      armFlush();
    } else if (mode === 'updates') {
      const step = Object.keys(chunk)[0];
      if (!step) continue;
      lastStep = step;
      // onStep writes the accumulated trail alongside the step name, so a flush pending
      // at this moment would write the same rows twice. Without an onStep there is
      // nothing else writing, and the debounce is left to fire on its own.
      if (onStep) {
        cancelFlush();
        await Promise.resolve(onStep(step, [...trail])).catch(() => {});
      }
    } else {
      finalState = chunk;
    }
  }

  // The backstop: anything the nodes did not report, recovered from the finished state.
  // Reports win — this only fills gaps (src/lib/researchTrail.js).
  for (const entry of deriveTrail(finalState ?? {})) {
    mergeActivity(trail, entry, { fillOnly: true });
  }
  flush();

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
  // `supports` has to come along: planGeneration buckets by it, so dropping it here would
  // leave every bucket empty and regenerating a single category would produce nothing.
  const requirements = kitDoc.role.requirements.map((r) => ({
    id: r.id,
    text: r.text,
    kind: r.kind,
    priority: r.priority,
    supports: r.supports ?? [],
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
        seniorityLevel: kitDoc.role.seniority_level ?? 'unstated',
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
      flashcards: kitDoc.flashcards.map((f) => ({
        id: f.id,
        requirement_ids: f.requirement_ids,
      })),
      // Carried through, or rebuilding the plan would quietly strip its links.
      resources: (kitDoc.resources ?? []).map((r) => ({ id: r.id, category: r.category })),
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
