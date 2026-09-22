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

  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),

  googleApiKey: process.env.GOOGLE_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
};
