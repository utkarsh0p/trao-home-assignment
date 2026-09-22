// The job poller reports `currentStep` as the LangGraph node that just finished. Those
// names are internal, and they do NOT arrive in order: the three research branches run
// in parallel, and the coverage loop re-enters check_coverage up to three times. A flat
// checklist would therefore lie about progress.
//
// So: group the nodes into five phases, track the furthest phase reached, and clamp it
// so it never goes backwards. "Closing the gaps" is a phase of its own on purpose — the
// second pass is the point of prd §3.4, and it deserves to be visible.

export const PHASES = [
  {
    id: "read",
    title: "Reading the posting",
    blurb: "Pulling out every requirement and marking it must or nice.",
  },
  {
    id: "research",
    title: "Researching the company",
    blurb: "Crawling the site for how they hire, and searching for public accounts of it.",
  },
  {
    id: "write",
    title: "Writing questions",
    blurb: "Each category generated separately, against what the research turned up.",
  },
  {
    id: "gaps",
    title: "Closing the gaps",
    blurb: "Checking every requirement has a question, then writing the ones that don't.",
  },
  {
    id: "schedule",
    title: "Building the schedule",
    blurb: "Spreading the work across your days, hardest material first.",
  },
];

const NODE_PHASE = {
  prepare: 0,
  extract_requirements: 0,

  crawl_site: 1,
  rank_links: 1,
  expand_hub: 1,
  fetch_pages: 1,
  search_discussion: 1,
  summarize_discussion: 1,
  await_research: 1,
  synthesize_research: 1,

  plan_generation: 2,
  generate_questions_technical: 2,
  generate_questions_behavioural: 2,
  generate_questions_system_design: 2,
  generate_questions_company_fit: 2,
  generate_flashcards: 2,

  check_coverage: 3,
  generate_gap_questions: 3,

  build_schedule: 4,
  validate_kit: 4,
  repair_kit: 4,
};

const NODE_LABEL = {
  queued: "Queued",
  starting: "Getting started",
  prepare: "Checking the company address",
  extract_requirements: "Reading the job description",

  crawl_site: "Crawling the company site",
  rank_links: "Working out which pages are worth reading",
  expand_hub: "Digging one level deeper",
  fetch_pages: "Reading the pages we picked",
  search_discussion: "Searching for public accounts of their process",
  summarize_discussion: "Summarising what people said",
  await_research: "Waiting for the research to land",
  synthesize_research: "Pulling the research together",

  plan_generation: "Planning the question set",
  generate_questions_technical: "Writing technical questions",
  generate_questions_behavioural: "Writing behavioural questions",
  generate_questions_system_design: "Writing system design questions",
  generate_questions_company_fit: "Writing company-fit questions",
  generate_flashcards: "Writing flashcards",

  check_coverage: "Checking every requirement has a question",
  generate_gap_questions: "Writing questions for what wasn't covered",

  build_schedule: "Laying out your days",
  validate_kit: "Checking the kit holds together",
  repair_kit: "Repairing the kit structure",

  done: "Done",
};

/** Index of the phase a step belongs to, or -1 for steps outside the graph proper. */
export function phaseOf(step) {
  if (step === "done") return PHASES.length;
  return NODE_PHASE[step] ?? -1;
}

export function labelFor(step) {
  if (!step) return "Starting up";
  // Regenerate jobs write free text ("replaced 4 generated item(s)") rather than a node
  // name. Showing it verbatim is better than showing nothing.
  return NODE_LABEL[step] ?? step;
}
