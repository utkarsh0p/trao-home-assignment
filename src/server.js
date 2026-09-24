import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { env } from './lib/env.js';
import { connectDb } from './db/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createNextHandler, hasFrontendBuild } from './lib/nextApp.js';
import { markStaleJobsFailed } from './services/job.service.js';

import authRoutes from './routes/auth.routes.js';
import kitRoutes from './routes/kit.routes.js';
import jobRoutes from './routes/job.routes.js';

/**
 * @param {{ nextHandler?: Function|null }} options
 *   `nextHandler` serves the built frontend from this same process — the whole app is
 *   one Render service. Omitted by the tests and the batch CLI, which need only the API.
 */
export function createApp({ nextHandler = null } = {}) {
  const app = express();

  // Render terminates TLS at a proxy; without this every request shares one IP and
  // the rate limiters bucket the whole world together.
  app.set('trust proxy', 1);

  // Helmet's default CSP is `script-src 'self'`, which would block the inline scripts
  // Next uses to hydrate. The strict set guards the API; pages get everything but CSP.
  app.use(['/api', '/health'], helmet());
  app.use(helmet({ contentSecurityPolicy: false }));

  // Frontend and API share an origin in production, so CORS is only ever needed for
  // local development, where `next dev` runs on its own port.
  if (!env.isProduction) {
    app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  }

  // Scoped to /api so the parser never touches a request destined for Next.
  app.use('/api', express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/kits', kitRoutes);
  app.use('/api/jobs', jobRoutes);

  // The JSON 404 belongs to the API alone: everything else is a page, and an unknown
  // page is Next's own 404 to render.
  app.use('/api', notFound);
  if (nextHandler) app.use((req, res) => nextHandler(req, res));
  else app.use(notFound);

  app.use(errorHandler);

  return app;
}

async function start() {
  await connectDb();

  // Jobs run in this process, so anything left 'running' died with the last restart.
  const swept = await markStaleJobsFailed();
  if (swept > 0) console.log(`Marked ${swept} interrupted job(s) as failed.`);

  // No build present means the API is being run on its own (`npm run dev`), with the
  // frontend served separately by `next dev`.
  const nextHandler = hasFrontendBuild() ? await createNextHandler() : null;

  const app = createApp({ nextHandler });
  app.listen(env.port, () => {
    const serving = nextHandler ? 'app + API' : 'API only';
    console.log(`${serving} listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  });
}

// Only auto-start when run directly, so tests and the CLI can import createApp.
if (process.argv[1]?.endsWith('server.js')) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
