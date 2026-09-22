import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { env } from './lib/env.js';
import { connectDb } from './db/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { markStaleJobsFailed } from './services/job.service.js';

import authRoutes from './routes/auth.routes.js';
import kitRoutes from './routes/kit.routes.js';
import jobRoutes from './routes/job.routes.js';

export function createApp() {
  const app = express();

  // Render terminates TLS at a proxy; without this every request shares one IP and
  // the rate limiters bucket the whole world together.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/kits', kitRoutes);
  app.use('/api/jobs', jobRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function start() {
  await connectDb();

  // Jobs run in this process, so anything left 'running' died with the last restart.
  const swept = await markStaleJobsFailed();
  if (swept > 0) console.log(`Marked ${swept} interrupted job(s) as failed.`);

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  });
}

// Only auto-start when run directly, so tests and the CLI can import createApp.
if (process.argv[1]?.endsWith('server.js')) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
