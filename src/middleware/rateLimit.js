import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { AppError } from './errorHandler.js';

/**
 * Outward-facing request limits on auth and generation endpoints.
 * Both hand off to the normal error middleware so a throttled client gets the same
 * { error: { code, message } } shape as everything else.
 */
function limiter({ windowMs, limit, code, message, byUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Generation is expensive per account, not per IP — two users behind one office
    // NAT should not throttle each other.
    keyGenerator: byUser ? (req) => req.user?.id ?? ipKeyGenerator(req.ip) : undefined,
    handler: (_req, _res, next) => next(new AppError(code, message, 429)),
  });
}

export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many attempts. Try again in a few minutes.',
});

export const generationLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  code: 'TOO_MANY_GENERATIONS',
  message: 'Generation limit reached for this hour.',
  byUser: true,
});
