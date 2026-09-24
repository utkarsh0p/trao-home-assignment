# AI Interview Prep Kit

Turns a pasted job description, a company website, and "how many days until my interview"
into a structured, editable, practisable interview preparation kit.

**Live:** https://trao-home-assignment.onrender.com

Built for the Trao Full-Stack Engineering Assessment (`FS-AI-INTERVIEW-01`).

> The Render free tier spins down when idle. The first request after a quiet period can
> take 30–50 seconds while the service wakes. It is not broken — give it a moment.

---

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Setup](#setup)
- [The batch entry point](#the-batch-entry-point)
- [Architecture](#architecture)
- [Retrieval: what we fetch, and from where](#retrieval-what-we-fetch-and-from-where)
- [Research and generation: the sequence](#research-and-generation-the-sequence)
- [The second pass, and when it stops](#the-second-pass-and-when-it-stops)
- [How the schedule is allocated](#how-the-schedule-is-allocated)
- [Generated, edited and pinned state](#generated-edited-and-pinned-state)
- [Practice mode](#practice-mode)
- [Long, failure-prone generation](#long-failure-prone-generation)
- [Edge cases](#edge-cases)
- [The custom feature](#the-custom-feature)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)
- [Known limitations](#known-limitations)

---

## What it does

Paste a job description, give a company URL and a number of days. The app extracts the
requirements, crawls the company site to work out what they do and how they hire, searches
for public discussion of their interview process, then writes a kit: a company brief, a role
breakdown, a categorised question bank, flashcards, and a day-by-day study schedule.

Every part of it is editable, reorderable, and regenerable a section at a time without
losing work done elsewhere. Flashcards are practisable inside the app, and the schedule is
something you work through rather than read.

**The kit is only ever as good as what was actually found.** A two-line job description
produces a thin kit that says it is thin. A company with no reachable site produces an
honest brief rather than a plausible one. That is a deliberate, load-bearing choice — see
[Edge cases](#edge-cases).

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind CSS v4 |
| Backend | Node.js ≥20 + Express 5 |
| Database | MongoDB (Atlas M0) via Mongoose |
| Language | JavaScript (ESM). Runtime validation with Zod |
| Orchestration | LangGraph (`@langchain/langgraph`) |
| Scraping | `fetch` + cheerio, escalating to Playwright only for client-rendered pages |
| Web search | Tavily (optional — see below) |
| LLM | **Google Gemini** (`gemini-3.6-flash`) via `@langchain/google-genai` |

This is the brief's preferred stack, unchanged — nothing was substituted, so nothing needs
defending. The two additions it left open:

**Gemini**, because the brief requires a provider with a genuine free tier and supplies no
key. **LangGraph**, because the pipeline contains a conditional loop — the coverage check
sends work back for another pass — and that is a graph rather than a chain.

---

## Setup

### Just the batch command

The batch entry point needs **one** credential and nothing else. No database, no session
secret, no search key.

```bash
git clone <repo> && cd traoassignment
npm install
echo "GOOGLE_API_KEY=..." > .env          # https://aistudio.google.com/apikey

npm run evaluate -- --input cases.json --output kits.json
```

That is the whole install step. Verified from a clean working directory whose `.env`
contained only `GOOGLE_API_KEY`: the run reports `Running without the fetch cache
(Missing required environment variable: MONGODB_URI)` and completes normally.

To try it against the bundled fixture sites, run `npm run fixtures` in another terminal
first (they serve on `http://localhost:8099`, which is what `cases.sample.json` points at):

```bash
npm run fixtures                                                      # terminal 1
npm run evaluate -- --input cases.sample.json --output kits.json      # terminal 2
```

### The full web app

```bash
npm install
cp .env.example .env        # then fill it in — every variable is documented there
npm run dev                 # API on :4000
npm run dev:web             # Next dev server on :3000
npm test                    # 69 tests — schedule, coverage, structure,
                            #   regeneration, robots.txt, search
```

Environment variables, all documented in `.env.example`:

| Variable | Required? | What it is for |
|---|---|---|
| `GOOGLE_API_KEY` | **Yes** | Gemini. The only credential the batch command needs. |
| `MONGODB_URI` | API only | Users, kits, jobs. The batch uses it *only* as a fetch cache and runs fine without it. |
| `JWT_SECRET` | Production only | Signs the session cookie. A throwaway dev default keeps the batch runnable without server-only secrets. |
| `TAVILY_API_KEY` | **No** | Web search. Without it the pipeline skips that one research step and says so in the kit. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.6-flash`. |
| `LLM_MAX_CONCURRENCY` | No | Ceiling on in-flight model calls. Narrows itself to 1 after repeated 429s. |
| `PORT`, `NODE_ENV`, `FRONTEND_ORIGIN`, `FIXTURE_PORT` | No | Defaults are sensible. |

### Deployment

**One service, not two.** `npm run build` builds the Next app; `npm start` runs
`src/server.js`, which mounts the built frontend (`src/lib/nextApp.js`) and serves it on
every route that is not `/api/*`. Render builds from the repo root and runs `npm start`.

That choice removes a whole class of problem: the session cookie is first-party so it stays
`sameSite: 'lax'` instead of needing `'none'`, CORS is compiled out of production entirely,
and there is one origin to configure rather than two. `npm start` only serves the frontend
when `frontend/.next` exists, so the two-process dev loop above is unaffected.

---

## The batch entry point

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Reads an array of `{ id, jd, company_url, days }` and writes the Appendix B shape. It calls
`runPipeline()` in `src/services/pipeline.service.js` — **the same function the HTTP API
calls**. There is no parallel batch implementation.

How it behaves:

- **One case failing never aborts the run.** A failed case is recorded with a stable error
  code and the run continues.
- **The output file always exists and is always parseable.** It is written after *every*
  case, atomically (temp file + rename), and flushed on `SIGINT`/`SIGTERM`. A run that dies
  halfway still leaves a complete file containing everything that finished.
- **Two workers, four-minute ceiling per case.** Five cases across two workers is three
  sequential slots, so the worst case stays inside the fifteen-minute budget.
- **`--` is optional.** `npm run evaluate --input a --output b` without the separator makes
  npm strip the flags; the CLI accepts two bare positional paths too, because failing a run
  over a missing `--` helps nobody.

Measured on the six bundled cases (spanning 1, 3, 5, 7, 10 and 60 days), with no search key:
**6/6 ok in 3.1 minutes.**

### Output shape

Exactly Appendix B, with two **additive** extensions to Appendix A — nothing renamed,
nothing removed:

- `notes[]` at the top level of a kit. This is where "a thin JD produces a thin kit that
  says so" actually lives. Without it the only record of a gap is a log line nobody reads.
- `flashcard_ids` on each schedule day. Without it the flashcards are a pile the plan never
  refers to — a user following the schedule would never be told to open them.

`completedAt` (how far through the plan you are) is stored but deliberately **not** exported:
that is app state, not kit structure. `Kit.toAppendixA()` is the single projection that
strips everything else back to the specified shape, and it runs before a kit is persisted as
well as on export, so a stored kit is always validated against the brief's shape rather than
our extended one.

---

## Architecture

The backend **is** the repo root. The frontend is a nested, independently-installed Next app.

```
src/
├── server.js              express app; mounts the built Next app in production
├── graph/                 langgraph nodes + assembly  (the pipeline)
├── services/              business logic — pipeline, schedule, coverage, kits, jobs
├── lib/                   scraper, crawler, search, llm client, zod schemas, url guard
├── models/                User, Kit, Job, FetchCache
├── routes/ controllers/   thin: path → middleware → controller → service
├── middleware/            auth, error handler, rate limiting, body validation
└── cli/evaluate.js        batch entry point
frontend/src/
├── app/                   routes
├── components/            kit builder, practice, intake, auth
└── lib/                   api client, hooks, pure derivations
tests/                     schedule, coverage, structure, regeneration, robots, search
```

Retrieval, extraction, generation, scheduling and persistence are separate layers. The
controllers hold no business logic; the services hold no req/res handling. Every kit
mutation is scoped by `userId` in one place (`kit.service.js`), so "users read and modify
only their own kits" is enforced in a single layer rather than remembered in each handler.

Errors returned to the frontend are always `{ error: { code, message } }` with a stable code
vocabulary (`COMPANY_UNREACHABLE`, `THIN_JD`, `KIT_NOT_FOUND`, `TOO_MANY_GENERATIONS`, …).
The batch output reuses the same vocabulary.

---

## Retrieval: what we fetch, and from where

**Sources used:**

1. **The pasted job description.** Never fetched from a job board — it arrives as text.
2. **The company's own website.** Crawled from the URL given.
3. **Public web search** for discussion of the company's interview process — Tavily, when a
   key is configured.

**Crawling.** One `fetch` with cheerio, escalating to Playwright *per page* only when the
extracted body is under ~200 characters, which means the page is client-rendered. Escalating
per page rather than per site is what protects the batch budget: one JS-heavy careers page
should not force a browser launch for the whole crawl.

**Finding the hiring page is the interesting part**, and a fixed list of paths is not
sufficient — the brief is explicit about that. So: fetch the homepage, harvest its links
with their anchor text, and have the model *rank* them by what they look like (`about`,
`hiring`, `blog`, `product`, `other`) with a confidence that a real hiring page is present.
If confidence is below 0.5, expand one promising hub one level deeper and rank again. That
expansion is capped at one. At most four pages are fetched.

**robots.txt is respected** — parsed ourselves (`src/lib/robots.js`, 10 tests covering
wildcards, `Allow` precedence by longest match, grouped user-agents) and checked *before* a
request is made, because the point of robots.txt is not to send the request.

**Relative links are followed properly and no host is assumed**, because the brief's own
example serves company sites from `http://localhost:8099/`.

**Untrusted input.** Both the pasted description and every crawled page are text we did not
write, and all of it reaches a model. URLs are validated by *resolving* the hostname and
checking the addresses — a public name can resolve to `169.254.169.254` just as easily —
with private and loopback ranges rejected in production. Only `text/html`,
`application/xhtml+xml` and `text/plain` are accepted, capped at 2 MB and 15s. Every piece
of fetched text is wrapped in a labelled `<<<BEGIN …>>>` block with delimiter-lookalikes
stripped first, and every system prompt states that content inside those blocks is source
material, never an instruction to follow.

---

## Research and generation: the sequence

The kit is produced by a sequence of steps that respond to what was actually found, not by
one prompt that returns everything. Twenty-one nodes; the shape that matters:

```
                    ┌─ extract_requirements ──────────────────┐
  prepare ──────────┼─ crawl_site → rank_links ⇄ expand_hub   ├─→ await_research
                    │        └─→ fetch_pages ────────────────┤   (barrier: all 3)
                    └─ search_discussion → summarize_discussion┘
                                                               │
                                          synthesize_research ←┘
                                                   │
                                            plan_generation
                          ┌────────────┬───────────┼───────────┬────────────┐
                    technical   behavioural   system-design  company-fit  flashcards
                          └────────────┴───────────┼───────────┴────────────┘
                                            check_coverage ⇄ generate_gap_questions
                                                   │
                                            build_schedule → validate_kit → repair_kit
```

What each step is responsible for:

| Node | Responsible for | Deterministic? |
|---|---|---|
| `prepare` | Normalising the URL, SSRF check, flagging a thin JD | **Yes** |
| `extract_requirements` | Pulling requirements from the JD, marking each must/nice, tagging which question categories each can support | LLM |
| `crawl_site` | Fetching the homepage, harvesting links | — |
| `rank_links` | Judging which links are worth reading | LLM |
| `expand_hub` | One level deeper when no hiring page was found | — |
| `fetch_pages` | Reading the chosen pages | — |
| `search_discussion` | Public discussion of how they interview | — |
| `summarize_discussion` | What those sources actually claim | LLM |
| `synthesize_research` | The company brief, grounded in page text | LLM |
| `plan_generation` | How many questions per category, against which requirements | **Yes** |
| `generate_questions_*` | One node per category, generated **separately** | LLM |
| `generate_flashcards` | Recall-sized facts | LLM |
| `check_coverage` | Which requirements have no question | **Yes** |
| `generate_gap_questions` | Questions for exactly the uncovered ids | LLM |
| `build_schedule` | Allocating material across the days | **Yes** |
| `validate_kit` / `repair_kit` | Structure check, then a bounded repair | **Yes** |

**The sequencing is genuine.** Pasted text needs no retrieval. A homepage needs crawling
before it is useful. A hiring page, once found, changes what questions make sense —
`plan_generation` shifts the mix toward system design or values when the process actually
mentions them. The four categories are four separate calls with different instructions,
not one call sliced up.

**Who decides which categories get asked.** `plan_generation` is deterministic, but it used
to be deterministic in the wrong way: three regexes — a "designable requirement text" list,
a "system design language" list, and a junior/senior job-title list — stood in for a
judgement about what a posting is asking for. They were wrong in both directions. A
"Software Developer Intern" posting that named SQL and relational databases hit the junior
keyword and produced zero system-design questions; a posting naming nothing designable could
pick some up purely because the company's careers page mentioned a design round.

So the division of labour is the one used everywhere else here: **the model reads and tags,
application code counts and allocates.** `extract_requirements` — already reading the
posting — tags each requirement with the question categories it could honestly support, and
normalises the seniority the posting states. `synthesize_research` and
`summarize_discussion` likewise report which categories the company's process actually
mentions, instead of leaving prose for a regex to scan. `plan_generation` then does
arithmetic over those tags: bucket, count, cap. No text is interpreted in it, which is why
it stays pure and unit-testable (`tests/planGeneration.test.js`).

Two rules survive from the old version and are tested: research can raise the weight of a
category the posting already supports, but **cannot create one from nothing** — a company
that runs a design round does not turn an internship about laptops into something worth
designing; and an empty `supports` array is a correct answer, so a category with nothing to
ask stays visibly empty rather than being filled with a strained question.

`supports` and `seniority_level` are extensions to the Appendix A structure, which permits
extension but not renaming. Both are internal to generation: `Kit.toAppendixA()` picks the
Appendix A fields by name, so neither reaches the export or the batch output.

**Two steps are never handed to the model**, as the brief requires:

- **Allocating topics across days is arithmetic** → `src/services/schedule.service.js`
- **Comparing questions against requirements is set logic** → `src/services/coverage.service.js`

Neither file imports the LLM client.

---

## The second pass, and when it stops

`check_coverage` unions the requirement ids cited by every question and subtracts them from
the requirement set. Anything left is a gap, and the graph routes back into
`generate_gap_questions` for exactly those ids, then checks again.

It also drops questions that cite *only* requirements we never extracted — a question
invented against a requirement set that does not exist cannot be allowed to count as
coverage. A question citing nothing at all is merely uncoupled, not invented, so it stays.

**Stopping rule** — the loop continues only while all three hold:

1. gaps remain,
2. fewer than **3** passes have run, and
3. the last pass actually *closed* some gaps.

Condition 3 is the important one. A requirement the model could not generate against on
pass 2 will not suddenly be answerable on pass 3; zero progress breaks immediately and the
leftovers ship honestly in `coverage.uncovered_requirement_ids` rather than burning two more
model calls to arrive at the same place. Three is the cap because the marginal value of a
fourth pass is near zero and the batch has a time budget to defend.

---

## How the schedule is allocated

Pure arithmetic in `src/services/schedule.service.js`. No model call.

Material is **priced**, then packed:

| Item | Cost |
|---|---|
| A new question | 10 / 15 / 25 min by difficulty 1–3 |
| Bringing one back (recall) | 4 / 6 / 9 min |
| A flashcard | 2 min |
| Opening a session | 5 min |

Teaching days are capped three ways and the tightest wins: the runway itself, a 60% share of
it (so there is room left to consolidate), and a floor of two questions per teaching day. A
session that still falls under 45 minutes is topped up with **more recall of earlier
material** — never with invented filler. Questions are ranked must-have-first, then hardest
first, with the original index as a stable tiebreak so the same inputs always produce the
same plan.

Guarantees, all covered by tests:

- exactly the number of days requested, numbered 1..n
- every question **and every flashcard** placed at least once
- every must-have requirement appears somewhere in the plan
- harder, higher-priority material lands earlier
- **the final day is a full run-through of everything**, never a slice
- integer minutes, always

Days beyond the teaching phase become spaced review at widening gaps (1, 3, 7, 14, 21, 30,
then fortnightly). A 60-day runway with thin material therefore does *not* become 55
identical half-hours — the days between sessions are labelled rest days that honestly claim
zero minutes, because saying "rest" is more useful than inventing busywork to fill a row.

---

## Generated, edited and pinned state

The hardest state problem in the assessment, and the design rests on two fields carried by
every question, flashcard, the company brief and the schedule:

```js
origin: 'generated' | 'edited' | 'manual'
pinned: boolean
```

- `generated` — written by the model, untouched
- `edited` — generated, then changed by hand (any field edit promotes it)
- `manual` — written by hand from the start
- `pinned` — an explicit "leave this alone", independent of origin

**The rule the whole builder rests on:** a regeneration replaces only items that are still
`origin === 'generated' && !pinned`, **and only within the section being regenerated**. One
predicate, in one place (`isReplaceable` in `src/services/kit.service.js`).

Everything else falls out of it. A question you edited survives its category's regeneration.
A question you wrote by hand survives. A pinned generated question survives. Regenerating
the technical questions does not read, let alone write, the behavioural ones. A brief you
rewrote is not overwritten — the API reports that it was *skipped*, rather than silently
discarding your work.

Pinning is a statement about regeneration, not a content change, so it does **not** promote
`origin`. Moving a question to another category *is* a reclassification by hand, so it does.

The frontend mirrors the same predicate in `kitDerive.js` so it can tell you, before you
click, what a regeneration would keep and replace — and afterwards, what it actually did.

---

## Practice mode

Flashcards are stepped through one at a time, answer hidden until asked for, then rated on a
five-point confidence scale (`No idea` → `Nailed it`). Fully keyboard-driven: space reveals,
1–5 rate, ← goes back.

**Next session ordering: never-seen cards first, then least confident, then least recently
seen.** Deterministic, testable, and honest about what it is.

I chose this over SM-2 or a real spaced-repetition interval deliberately. SM-2 optimises
retention over months; this app exists for a horizon of 1 to 60 days, most often under two
weeks, and a card will be seen a handful of times at most. Over that horizon an interval
schedule and a confidence sort produce nearly the same order, and the confidence sort is one
comparator a reader can verify at a glance. The *schedule* carries the spacing (widening
review gaps); the practice deck carries the ordering within a session.

The panel also shows what has been covered and what has not — by requirement text, not by
id — so "what am I still weak on" is answerable.

---

## Long, failure-prone generation

A run takes 30–90 seconds, calls an external model, and can fail halfway. The approach:

**It never blocks a request.** `POST /api/jobs` validates, creates a job, starts the run in
the background and answers `202` with a job id. The client polls every 1.5s. The graph
writes each completed node into the job, so progress is real rather than a spinner —
grouped into five phases with a high-water mark, because the three research branches finish
out of order and the coverage loop re-enters `check_coverage`, so a flat checklist would
lie.

**Closing the tab is safe.** The run continues server-side and the kit appears in My kits.

**Submitting twice does not run it twice.** A `sha256` of `jd + company_url + days` is the
dedupe key; an identical submission within 10 minutes returns the run already in flight. If
that run already finished, the response carries its `kitId` and the client goes straight to
the kit rather than polling a job that will never move again.

**A restart does not strand a job.** Jobs run in-process, so anything left `running` when
the server dies is swept to `failed` with `RUN_INTERRUPTED` at boot — otherwise the client
polls forever.

**Rate limits are treated as a signal, not a fault.** The LLM client caps concurrency,
retries with exponential backoff and jitter, reads the provider's own `retryDelay` when it
supplies one ("wait 27 seconds" beats a guess), and after 3 rate-limit hits **permanently
narrows to one call at a time for the rest of the process**. A schema mismatch is *not*
retried — it will not fix itself at the same temperature.

Generation and regeneration are rate limited per **user**, not per IP (20/hour), so two
people behind one office NAT do not throttle each other.

---

## Edge cases

Every one of these produces a kit, not a crash. The gap is recorded in `notes[]` and, where
something actually failed, in `researchErrors`.

| Case | Behaviour |
|---|---|
| URL invalid / 404 / times out | Recorded as a missing source; the kit is built from the JD alone and says so |
| No discoverable hiring page | One hub expansion, then an honest "no hiring information was found" |
| Two-line job description | Few requirements extracted, and the kit states its own thinness. **Padding it to fifteen would be the failure** |
| Public discussion turns up nothing | Distinguished from "we could not search" — see below |
| Model returns invalid / incomplete JSON | Structured output + Zod; then `repair_kit` prunes and rebuilds; still invalid → the case fails honestly rather than persisting a malformed kit |
| Provider rate-limits | Backoff, provider-supplied delay, permanent concurrency narrowing |
| Same description submitted twice | Dedupe hash returns the in-flight or finished run |
| 1-day and 60-day schedules | Both tested; 1 day puts everything in one session, 60 becomes spaced review with honest rest days |

**"We did not look" is never reported as "there is nothing to find."** The search reports
three distinct outcomes — *no provider configured*, *searched and found nothing*, *tried and
failed* — and they are three different sentences in the kit. This mattered: an earlier
version caught every search error into an empty array, so **every kit ever generated claimed
no public discussion existed**, which was false. A failure is also never cached, so one bad
minute cannot poison a day of runs.

---

---

## The custom feature

**Schedule Checks** — the schedule tab recomputes, live, the four properties §8 requires,
from the plan currently on screen rather than from the generation run, and shows the
evidence:

- does it span exactly the days requested?
- does every must-have requirement appear somewhere in it?
- does harder, higher-priority material still land earliest?
- are there days whose minutes no longer match their content, or that reference a deleted
  question or card?

**The problem it solves:** the moment a kit becomes editable, its own metadata starts lying.
Delete a question and the day still claims 45 minutes. Add one by hand and it sits in no day
at all. Regenerate a category and the plan points at ids that no longer exist. A prep kit
that silently drifts out of correctness is worse than one you cannot edit, because you trust
it anyway.

So rather than asserting in prose that the plan is sound, the app checks and shows it — and
names exactly which requirement, day or question broke when it is not. The same derivations
power a live coverage figure that updates as you edit, instead of the stale
generation-time `coverage` field.

### Things to watch and read

A second, smaller addition: each question category and each teaching day carries one or two
**real videos and articles**, found by searching for the role — "Backend Engineer
behavioural interview questions", not the company name, because that is what returns
something worth an evening.

**The problem it solves:** a kit that asks "walk me through how you would design this" and
then leaves you to go and find something to study from is doing half the job. The questions
name the gaps; this names where to close them.

Everything about a resource is copied from the search result or derived from its URL — the
title, the publisher (`YouTube`, or the host), the thumbnail (from the video id, no API key
involved). A `youtube.com` hit whose video id will not parse is a channel or a search page,
not a video, so it is dropped rather than linked. **There is no field an invention could
occupy**, which is how rule 4 is kept structurally rather than by prompt wording. With no
`TAVILY_API_KEY` the kit gets none and says so, exactly as the public-discussion search does.

Placement on a day is arithmetic inside `buildSchedule` — two per day at most, matched by
category, never on a rest day, and **worth zero minutes**: the estimate is of the work the
kit asks for, and a link is an offer rather than an assignment.

They are app state: `toAppendixA()` omits them, so `kits.json` is byte-for-byte what it was
before the feature existed.

### Watching the run happen

The progress screen streams each activity as it starts — every page crawled and fetched,
each search, each question category being written, each coverage pass — through LangGraph's
`custom` stream mode, which reaches the client *before* a node returns.

**The problem it solves:** the trail used to be derived from accumulated graph state, and
state cannot say "started". So the search row appeared already carrying its outcome: a
Tavily call is two queries against a 15s timeout, and for all of it the screen read
`× public discussion — NOTHING USABLE FOUND`, then flipped to `✓ 6 SOURCES`. It also
collapsed three different facts — no provider configured, nothing found, the search
failed — into that one sentence. Now there are three glyphs and three sentences, and a row
that says it is searching while it searches.

---

## Design decisions and trade-offs

**One deploy, not two.** Express serves the built Next app on every non-`/api` route. Costs
a slightly unusual server file; buys a first-party session cookie, no production CORS, and
one service to configure.

**Jobs run in-process, not on a queue.** A real queue (BullMQ + Redis) would survive
restarts. It would also add a service to a free-tier deployment for a workload of one job
per user per minute. The trade-off is disclosed and handled: interrupted jobs are swept at
boot rather than left polling forever.

**Mongo is a cache, not a dependency, for the batch.** Batch cases have no owning user, so
the only thing a database offers is a fetch cache, and the run is designed to work without
one. `npm run evaluate` therefore needs no `MONGODB_URI`.

**The search provider is a capability, not a hardcoded backend.** `src/lib/search.js` holds
a provider registry and uses the first provider that reports itself configured. Nothing in
the codebase branches on which command is running — the batch is not special-cased, it is
simply an environment where that capability is absent, handled exactly like a company whose
site cannot be reached. Adding a second provider means appending to one array.

**DuckDuckGo was tried first and removed.** It blocks programmatically — a CAPTCHA under
load — and a single blocked search cost **224 seconds**, which timed out three of six cases
against a fifteen-minute budget for five. About 150 lines of browser escalation, request
pacing and circuit-breaking went with it. (`@langchain/community`'s `DuckDuckGoSearch` is
not an alternative: it wraps the same library and hits the same block.)

---

## Known limitations

**Public-discussion research needs a key.** Without `TAVILY_API_KEY` the pipeline skips that
one step and records it in the kit's notes. Everything else — crawling, extraction,
generation, scheduling, validation — is unaffected. This is by design so the batch command
runs from a clean clone with only an LLM key, but it does mean a kit built that way has no
insight into how the company interviews beyond what their own site says.

**Same-name company confusion.** A search provider returns its closest matches, so a company
with a common name can attract results about a *different* company of the same name. The
summariser is instructed to ignore snippets not clearly about the named company and to
return an empty summary rather than invent a process — which works when the businesses are
obviously different, but a same-name company in a similar line of work can still slip
through into `company_brief.sources`. The fix is to ground the check on what the company
*does* (already crawled) rather than on its name alone; it is not implemented.

**`minutes` is written once.** Delete a question after generation and the day still claims
the old duration. Rather than silently re-timing the plan behind the user's back, the UI
detects the drift and offers a rebuild — but the stored value is stale until they take it.

**The question-count floor can look generous on a very thin JD.** A 35-character
description yields one requirement (correct — it does not invent more), but the per-category
floor still produces a handful of questions from it. They are grounded in that single
requirement and the company research, so nothing is fabricated, but the ratio looks odd.

**Regenerating a section does not re-file it into the schedule.** New questions land outside
the plan until the schedule is rebuilt. The UI says so at the point of adding and again on
the schedule tab, rather than rebuilding automatically and quietly discarding a plan the
user may have been working through.

**No test coverage of the HTTP layer.** The brief names schedule allocation, coverage
checking and structure validation as the behaviour worth protecting, and the tests stop
there rather than chasing coverage elsewhere.
