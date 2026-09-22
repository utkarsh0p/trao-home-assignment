#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Serves the fixture company sites so the batch command can be rehearsed exactly as it
 * will be run against us: `company_url` values on a local address, relative links, and
 * a hiring page buried where no fixed path list would find it.
 *
 *   npm run fixtures
 *   npm run evaluate -- --input cases.sample.json --output kits.json
 *
 * Deliberately dependency-free — this is test scaffolding, not something to install a
 * static server for. Port 8099 matches the example in the brief's Appendix B.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sites');
const PORT = Number(process.env.FIXTURE_PORT ?? 8099);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function resolveSafely(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  // A directory asks for its index, the way a real site does.
  const relative = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const target = path.join(ROOT, relative);

  // Never serve outside the fixture tree, however the path is spelled.
  return target.startsWith(ROOT) ? target : null;
}

const server = http.createServer(async (req, res) => {
  const target = resolveSafely(req.url ?? '/');

  if (!target) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }

  try {
    const body = await fs.readFile(target);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(target)] ?? 'text/html' });
    console.log(`200 ${req.url}`);
    return res.end(body);
  } catch {
    // Exercised on purpose by the case pointing at a path that does not exist.
    res.writeHead(404, { 'content-type': 'text/html' });
    console.log(`404 ${req.url}`);
    return res.end('<!doctype html><title>404</title><h1>Not found</h1>');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Free it, or pick another:\n` +
        `  FIXTURE_PORT=8100 npm run fixtures\n` +
        '(then point the company_url values in your cases file at that port).',
    );
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`Fixture sites on http://localhost:${PORT}`);
  console.log(`  http://localhost:${PORT}/acme/      — hiring page at /company/handbook/joining.html`);
  console.log(`  http://localhost:${PORT}/quietco/   — no hiring page anywhere`);
});
