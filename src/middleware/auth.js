import jwt from 'jsonwebtoken';

import { env } from '../lib/env.js';
import { AppError } from './errorHandler.js';

export const AUTH_COOKIE = 'token';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
}

/**
 * Cookie options shared by login and logout so the two always agree — a logout that
 * sets different options silently fails to clear the cookie.
 *
 * 'lax' because the app is one deploy: Express serves the pages and the API from a
 * single origin, so the session cookie is first-party and never needs 'none'.
 */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS * 1000,
  };
}

/** Verifies the JWT httpOnly cookie and attaches req.user. */
export function requireAuth(req, _res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return next(new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub };
    return next();
  } catch (err) {
    // Expired and malformed are the same thing to the client: sign in again.
    const code = err.name === 'TokenExpiredError' ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED';
    return next(new AppError(code, 'Your session has expired. Sign in again.', 401));
  }
}
