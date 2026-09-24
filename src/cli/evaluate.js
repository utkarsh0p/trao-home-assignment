#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { connectDb, disconnectDb } from '../db/db.js';
import { runPipeline } from '../services/pipeline.service.js';
import { isLlmConfigured } from '../lib/llm.js';
import { toAppendixA } from '../lib/kitSchema.js';

/**
 * Batch entry point:
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Calls the same runPipeline() the HTTP API calls — a parallel batch implementation is
 * explicitly disqualifying (CLAUDE.md rule 7). Nothing is persisted: batch cases have no
 * owning user, so the only thing a database would offer is a fetch cache, and the run is
 * designed to work without one. The single credential this command needs is an LLM key.
 *
 * Two rules shape everything below. One case failing never aborts the run. And an output
 * file must exist no matter how the process ends, because a run that produced four good
 * kits and then died writing them scores the same as a run that never started.
 */

const OUTPUT_VERSION = '1.0';
const DEFAULT_CONCURRENCY = 2;

/**
 * Nothing else bounds a single case: a site that accepts a connection and then dangles,
 * or a model call that hangs below the retry layer, would otherwise hold a worker for
 * the whole run. Five cases across two workers is three sequential slots, so four
 * minutes each keeps the worst case inside the fifteen-minute budget.
 */
const DEFAULT_CASE_TIMEOUT_MS = 4 * 60 * 1000;

/** The API caps days at 60; the batch is more permissive but still refuses nonsense. */
const MAX_DAYS = 365;

function parseCliArgs() {
  const { values, positionals } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      concurrency: { type: 'string', short: 'c' },
      timeout: { type: 'string', short: 't' },
    },
    allowPositionals: true,
  });

  // `npm run evaluate --input a --output b` — without npm's `--` separator — silently
  // strips the flags and hands us two bare paths. The documented form is the one in the
  // brief, but failing a run over a missing `--` helps nobody, so take them in order.
  const input = values.input ?? positionals[0];
  const output = values.output ?? positionals[1];

  if (!input || !output) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  const timeoutSeconds = Number(values.timeout);

  return {
    input: path.resolve(input),
    output: path.resolve(output),
    concurrency: Math.max(1, Number(values.concurrency) || DEFAULT_CONCURRENCY),
    caseTimeoutMs:
      Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
        ? timeoutSeconds * 1000
        : DEFAULT_CASE_TIMEOUT_MS,
  };
}

/* ----------------------------------------------------------------------- input */

/**
 * The cases file is hand-written JSON we do not control, so every field is coerced
 * rather than trusted. A typo in one field should cost that field, not the case.
 */
function normalizeCases(parsed) {
  const list = Array.isArray(parsed) ? parsed : parsed?.cases;
  if (!Array.isArray(list)) {
    throw new Error('Input must be an array of cases, or an object with a "cases" array.');
  }

  const seen = new Set();

  return list.map((entry, index) => {
    const id = String(entry?.id ?? `case-${index + 1}`);
    if (seen.has(id)) {
      console.warn(`Duplicate case id "${id}" — both will appear in the output.`);
    }
    seen.add(id);

    // Clamped rather than rejected: the brief requires a 1-day and a 60-day schedule to
    // work, and buildSchedule throws on anything that is not a positive integer, so a
    // JSON typo like "5" would otherwise fail an otherwise perfectly good case.
    const requested = Math.floor(Number(entry?.days));
    const days = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_DAYS) : 1;
    if (days !== requested) {
      console.warn(`Case ${id}: days ${JSON.stringify(entry?.days)} coerced to ${days}.`);
    }

    return {
      id,
      jd: String(entry?.jd ?? ''),
      companyUrl: String(entry?.company_url ?? entry?.companyUrl ?? ''),
      days,
    };
  });
}

async function readCases(inputPath) {
  const raw = await fs.readFile(inputPath, 'utf8');
  return normalizeCases(JSON.parse(raw));
}

/* ---------------------------------------------------------------------- output */

/**
 * Writes the Appendix B file. Called after every case rather than once at the end, so
 * an interrupted run still leaves a complete, parseable file holding everything that
 * finished. Writing to a temp path and renaming makes each write atomic — a reader can
 * never catch a half-serialised file — and serialising through a promise chain keeps
 * two workers finishing at once from interleaving.
 */
function createWriter(outputPath) {
  let chain = Promise.resolve();

  return (results) => {
    const payload = {
      version: OUTPUT_VERSION,
      generated_at: new Date().toISOString(),
      kits: results,
    };
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const temporary = `${outputPath}.tmp`;

    chain = chain
      .then(async () => {
        await fs.writeFile(temporary, body, 'utf8');
        await fs.rename(temporary, outputPath);
      })
      .catch((error) => console.error(`Could not write ${outputPath}: ${error.message}`));

    return chain;
  };
}

/** The placeholder a case holds until it runs, so the file is always well-formed. */
const pending = (entry) => ({
  id: entry.id,
  status: 'failed',
  kit: null,
  error: { code: 'NOT_RUN', message: 'The run ended before this case was reached.' },
});

/* ------------------------------------------------------------------------- run */

/**
 * The fetch cache is an optimisation, never a dependency. With no MONGODB_URI the
 * cache calls short-circuit (see src/models/FetchCache.js) and the run simply pays the
 * network cost it would have paid anyway.
 */
async function connectCacheOrContinue() {
  try {
    await connectDb();
    return true;
  } catch (error) {
    console.warn(`Running without the fetch cache (${error.message}).`);
    return false;
  }
}

class CaseTimeout extends Error {
  constructor(ms) {
    super(`Gave up after ${Math.round(ms / 1000)}s.`);
    this.code = 'CASE_TIMEOUT';
  }
}

/**
 * The losing side of the race is abandoned rather than cancelled — LangGraph offers no
 * cooperative cancellation here — so an abandoned run may still hold an LLM slot. At
 * four minutes that is already the pathological case, and letting the batch finish
 * matters more than reclaiming the slot.
 */
function withTimeout(promise, ms) {
  let timer;
  const expiry = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new CaseTimeout(ms)), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

async function runCase(entry, index, total, caseTimeoutMs) {
  const label = `[${index + 1}/${total}] ${entry.id}`;
  const startedAt = Date.now();

  try {
    const { kit, notes } = await withTimeout(
      runPipeline({
        jd: entry.jd,
        companyUrl: entry.companyUrl,
        days: entry.days,
        caseId: entry.id,
        onStep: (step) => console.log(`${label} ${step}`),
      }),
      caseTimeoutMs,
    );

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `${label} ok in ${seconds}s — ${kit.role.requirements.length} requirements, ` +
        `${kit.questions.length} questions, ${kit.schedule.days.length} days, ${notes.length} note(s)`,
    );

    // A case we could only partially research is still "ok", with the gaps recorded
    // honestly inside the kit. A missing hiring page is not a failure.
    //
    // Projected, not written raw: the pipeline's kit carries the app's additions, and
    // this file's output is the one the brief specifies exactly.
    return { id: entry.id, status: 'ok', kit: toAppendixA(kit), error: null };
  } catch (error) {
    console.error(`${label} failed: ${error.code ?? 'PIPELINE_FAILED'} — ${error.message}`);
    return {
      id: entry.id,
      status: 'failed',
      kit: null,
      error: {
        code: error.code ?? 'PIPELINE_FAILED',
        message: String(error.message ?? 'Unknown failure.').slice(0, 500),
      },
    };
  }
}

/** A small worker pool: five cases must finish inside fifteen minutes. */
async function runAll(cases, { concurrency, caseTimeoutMs, results, write }) {
  let cursor = 0;

  const worker = async () => {
    while (cursor < cases.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await runCase(cases[index], index, cases.length, caseTimeoutMs);
      await write(results);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
}

async function main() {
  const { input, output, concurrency, caseTimeoutMs } = parseCliArgs();

  if (!isLlmConfigured()) {
    console.error('GOOGLE_API_KEY is not set. See .env.example.');
    process.exit(1);
  }

  const cases = await readCases(input);
  const results = cases.map(pending);
  const write = createWriter(output);

  await fs.mkdir(path.dirname(output), { recursive: true });
  await write(results);

  console.log(
    `Running ${cases.length} case(s), ${concurrency} at a time, ` +
      `${Math.round(caseTimeoutMs / 1000)}s per case → ${output}`,
  );

  // Whatever ends this process, the file on disk reflects what finished.
  const flushAndExit = (signal) => {
    console.warn(`\nReceived ${signal} — writing what has completed so far.`);
    write(results).finally(() => process.exit(130));
  };
  process.on('SIGINT', () => flushAndExit('SIGINT'));
  process.on('SIGTERM', () => flushAndExit('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection during the run:', reason);
  });

  const connected = await connectCacheOrContinue();
  const startedAt = Date.now();

  try {
    await runAll(cases, { concurrency, caseTimeoutMs, results, write });
  } finally {
    await write(results);
    if (connected) await disconnectDb();
  }

  const ok = results.filter((entry) => entry.status === 'ok').length;
  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\n${ok}/${results.length} ok in ${minutes} min → ${output}`);
}

main().catch((error) => {
  console.error('Batch run failed to start:', error.message ?? error);
  process.exit(1);
});
