#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from '../db/db.js';
import { runPipeline } from '../services/pipeline.service.js';
import { isLlmConfigured } from '../lib/llm.js';

/**
 * Batch entry point:
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Calls the same runPipeline() the HTTP API calls — a parallel batch implementation
 * is explicitly disqualifying (CLAUDE.md rule 7). Nothing is persisted: batch cases
 * have no owning user, so Mongo is used only as a fetch cache, and the run works
 * without it.
 *
 * One case failing never aborts the run; it is recorded and the rest continue.
 */

const OUTPUT_VERSION = '1.0';
const DEFAULT_CONCURRENCY = 2;

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      concurrency: { type: 'string', short: 'c' },
    },
    allowPositionals: true,
  });

  if (!values.input || !values.output) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  return {
    input: path.resolve(values.input),
    output: path.resolve(values.output),
    concurrency: Math.max(1, Number(values.concurrency ?? DEFAULT_CONCURRENCY)),
  };
}

async function readCases(inputPath) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases)) throw new Error('Input file must contain an array of cases.');
  return cases;
}

/**
 * The fetch cache is an optimisation, never a dependency: without a database the
 * batch still runs, it just pays the network cost on a retry.
 */
async function connectCacheOrContinue() {
  try {
    await connectDb();
    return true;
  } catch (error) {
    // Fail cache reads instantly rather than letting mongoose buffer each one.
    mongoose.set('bufferCommands', false);
    console.warn(`Running without the fetch cache (${error.message}).`);
    return false;
  }
}

async function runCase(entry, index, total) {
  const id = entry.id ?? `case-${index + 1}`;
  const label = `[${index + 1}/${total}] ${id}`;
  const startedAt = Date.now();

  try {
    const { kit, notes } = await runPipeline({
      jd: entry.jd ?? '',
      companyUrl: entry.company_url ?? entry.companyUrl ?? '',
      days: entry.days ?? 1,
      caseId: id,
      onStep: (step) => console.log(`${label} ${step}`),
    });

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `${label} ok in ${seconds}s — ${kit.role.requirements.length} requirements, ` +
        `${kit.questions.length} questions, ${notes.length} note(s)`,
    );

    // A case we could only partially research is still "ok", with the gaps recorded
    // honestly inside the kit. A missing hiring page is not a failure.
    return { id, status: 'ok', kit, error: null };
  } catch (error) {
    console.error(`${label} failed: ${error.code ?? 'PIPELINE_FAILED'} — ${error.message}`);
    return {
      id,
      status: 'failed',
      kit: null,
      error: {
        code: error.code ?? 'PIPELINE_FAILED',
        message: error.message ?? 'Unknown failure.',
      },
    };
  }
}

/** A small worker pool: five cases must finish inside fifteen minutes. */
async function runAll(cases, concurrency) {
  const results = new Array(cases.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < cases.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await runCase(cases[index], index, cases.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  return results;
}

async function main() {
  const { input, output, concurrency } = parseCliArgs();

  if (!isLlmConfigured()) {
    console.error('GOOGLE_API_KEY is not set. See .env.example.');
    process.exit(1);
  }

  const cases = await readCases(input);
  console.log(`Running ${cases.length} case(s) with concurrency ${concurrency}.`);

  const connected = await connectCacheOrContinue();
  const startedAt = Date.now();

  let kits;
  try {
    kits = await runAll(cases, concurrency);
  } finally {
    if (connected) await disconnectDb();
  }

  const payload = {
    version: OUTPUT_VERSION,
    generated_at: new Date().toISOString(),
    kits,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const ok = kits.filter((entry) => entry.status === 'ok').length;
  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\n${ok}/${kits.length} ok in ${minutes} min → ${output}`);
}

main().catch((error) => {
  console.error('Batch run failed to start:', error);
  process.exit(1);
});
