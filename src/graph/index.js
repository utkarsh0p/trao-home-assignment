import { END, START, StateGraph } from '@langchain/langgraph';

import { KitState } from './state.js';
import * as nodes from './nodes.js';
import { RESEARCH_BRANCH_COUNT } from './nodes.js';
import { shouldRunAnotherPass } from '../services/coverage.service.js';
import { validateKit } from '../lib/kitSchema.js';
import { QUESTION_CATEGORIES } from '../lib/kitSchema.js';

/**
 * Assembles the LangGraph: nodes, edges, and the conditional coverage loop
 * (.claude/graph.md).
 *
 * The shape that matters: three independent research branches fan out from `prepare`
 * and rejoin at `synthesize_research`; question generation fans out per category; and
 * `check_coverage` loops back through `generate_gap_questions` until the gaps stop
 * closing. That loop is the second pass the brief asks for, and it is the reason this
 * is a graph rather than a chain.
 */

/** Hiring-page confidence is low and we have not spent our one expansion yet. */
const HIRING_CONFIDENCE_THRESHOLD = 0.5;

function routeAfterRanking(state) {
  const confident = (state.hiringPageConfidence ?? 0) >= HIRING_CONFIDENCE_THRESHOLD;
  const canExpand = (state.expansions ?? 0) < 1 && (state.linkCandidates ?? []).length > 0;
  return !confident && canExpand ? 'expand_hub' : 'fetch_pages';
}

/**
 * Holds the research join until all three branches are in. Early arrivals are routed
 * to END, which ends that path only — the run continues until no tasks remain.
 */
function routeAfterResearchBranches(state) {
  return (state.researchBranchesDone ?? 0) >= RESEARCH_BRANCH_COUNT ? 'synthesize_research' : END;
}

function routeAfterCoverage(state) {
  return shouldRunAnotherPass(state.coverage) ? 'generate_gap_questions' : 'build_schedule';
}

function routeAfterValidation(state) {
  return validateKit(state.kit).ok ? END : 'repair_kit';
}

const QUESTION_NODE = (category) => `generate_questions_${category.replace('-', '_')}`;

export function buildGraph() {
  const graph = new StateGraph(KitState)
    .addNode('prepare', nodes.prepare)
    .addNode('extract_requirements', nodes.extractRequirements)
    .addNode('crawl_site', nodes.crawlSiteNode)
    .addNode('rank_links', nodes.rankLinks)
    .addNode('expand_hub', nodes.expandHubNode)
    .addNode('fetch_pages', nodes.fetchPages)
    .addNode('search_discussion', nodes.searchDiscussion)
    .addNode('summarize_discussion', nodes.summarizeDiscussion)
    .addNode('await_research', nodes.awaitResearch)
    .addNode('synthesize_research', nodes.synthesizeResearch)
    .addNode('plan_generation', nodes.planGeneration)
    .addNode('generate_flashcards', nodes.generateFlashcards)
    .addNode('find_resources', nodes.findResources)
    .addNode('check_coverage', nodes.checkCoverageNode)
    .addNode('generate_gap_questions', nodes.generateGapQuestions)
    .addNode('build_schedule', nodes.buildScheduleNode)
    .addNode('validate_kit', nodes.validateKitNode)
    .addNode('repair_kit', nodes.repairKitNode);

  for (const category of QUESTION_CATEGORIES) {
    graph.addNode(QUESTION_NODE(category), nodes.makeQuestionNode(category));
  }

  graph.addEdge(START, 'prepare');

  // Three independent sources, fetched concurrently: the JD, the company site, and
  // public discussion. None of them needs the others.
  graph.addEdge('prepare', 'extract_requirements');
  graph.addEdge('prepare', 'crawl_site');
  graph.addEdge('prepare', 'search_discussion');

  // Adaptive two-level crawl: rank what the homepage links to, and if nothing looks
  // like a hiring page, expand one promising hub and rank again. Capped at one.
  graph.addEdge('crawl_site', 'rank_links');
  graph.addConditionalEdges('rank_links', routeAfterRanking, {
    expand_hub: 'expand_hub',
    fetch_pages: 'fetch_pages',
  });
  graph.addEdge('expand_hub', 'rank_links');

  // summarize_discussion is entered unconditionally and returns immediately when the
  // search found nothing, rather than being skipped by an edge. Same behaviour — no
  // model call on an empty search — with one less branch that can strand the barrier
  // at synthesize_research.
  graph.addEdge('search_discussion', 'summarize_discussion');

  // The barrier: all three branches must land before the brief can be written.
  // They sit at different depths, so without the explicit gate below LangGraph would
  // start synthesis once per arriving branch and triple everything downstream.
  graph.addEdge('extract_requirements', 'await_research');
  graph.addEdge('fetch_pages', 'await_research');
  graph.addEdge('summarize_discussion', 'await_research');
  graph.addConditionalEdges('await_research', routeAfterResearchBranches, {
    synthesize_research: 'synthesize_research',
    [END]: END,
  });

  graph.addEdge('synthesize_research', 'plan_generation');

  // Four categories plus flashcards plus the resource search, all in parallel.
  // Flashcards depend only on requirements and research, coverage concerns questions
  // only, and the resource search needs nothing but the role title and the plan's
  // category counts — so all six are free. No barrier is needed here: these land in one
  // superstep, unlike the research branches (.claude/decisions.md).
  for (const category of QUESTION_CATEGORIES) {
    graph.addEdge('plan_generation', QUESTION_NODE(category));
    graph.addEdge(QUESTION_NODE(category), 'check_coverage');
  }
  graph.addEdge('plan_generation', 'generate_flashcards');
  graph.addEdge('generate_flashcards', 'check_coverage');

  // Network-bound but model-free, so it costs no LLM concurrency and hides entirely
  // behind the five generation calls above it.
  graph.addEdge('plan_generation', 'find_resources');
  graph.addEdge('find_resources', 'check_coverage');

  // The second pass. Loops while gaps remain, we are under the cap, and the last pass
  // actually closed some; zero progress breaks immediately.
  graph.addConditionalEdges('check_coverage', routeAfterCoverage, {
    generate_gap_questions: 'generate_gap_questions',
    build_schedule: 'build_schedule',
  });
  graph.addEdge('generate_gap_questions', 'check_coverage');

  graph.addEdge('build_schedule', 'validate_kit');
  graph.addConditionalEdges('validate_kit', routeAfterValidation, {
    repair_kit: 'repair_kit',
    [END]: END,
  });
  graph.addEdge('repair_kit', END);

  return graph.compile();
}

let compiled = null;
/** Compiled once and reused — the topology never changes between runs. */
export function getGraph() {
  if (!compiled) compiled = buildGraph();
  return compiled;
}

/** A backstop beneath the explicit caps on expansions and coverage passes. */
export const RECURSION_LIMIT = 40;

export default getGraph;
