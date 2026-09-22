import dotenv from 'dotenv';

dotenv.config();

/**
 * Reads a required environment variable, failing loudly at boot rather than
 * at the first request. Every var here is documented in .env.example.
 */
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',

  // Not required at import: `npm run evaluate` must run from a clean clone with only
  // an LLM key, and it uses Mongo purely as a fetch cache. connectDb() enforces the
  // variable when a database is actually needed.
  mongoUri: process.env.MONGODB_URI ?? '',

  // Required in production. The dev fallback keeps the batch command runnable without
  // server-only secrets; a deployed API refuses to boot without a real one.
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? required('JWT_SECRET')
      : 'dev-only-insecure-jwt-secret'),

  googleApiKey: process.env.GOOGLE_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
  // Max in-flight model calls. Whoever runs the batch may be on a free key, and the
  // brief scores handling being told to slow down.
  llmMaxConcurrency: Number(process.env.LLM_MAX_CONCURRENCY ?? 5),
};
