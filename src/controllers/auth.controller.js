import { z } from 'zod';

import * as authService from '../services/auth.service.js';
import { AUTH_COOKIE, authCookieOptions, signToken } from '../middleware/auth.js';

export const credentialsSchema = z.object({
  email: z.string().email('must be a valid email address'),
  password: z.string().min(8, 'must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('must be a valid email address'),
  password: z.string().min(1, 'is required'),
});

function issueSession(res, user) {
  res.cookie(AUTH_COOKIE, signToken(user.id), authCookieOptions());
  return { user: { id: user.id, email: user.email } };
}

export async function register(req, res, next) {
  try {
    const user = await authService.registerUser(req.body);
    res.status(201).json(issueSession(res, user));
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const user = await authService.authenticate(req.body);
    res.json(issueSession(res, user));
  } catch (err) {
    next(err);
  }
}

export async function logout(_req, res) {
  // maxAge omitted so the cookie is cleared rather than re-dated; the rest of the
  // options must match the ones it was set with or the browser keeps it.
  const { maxAge, ...options } = authCookieOptions();
  res.clearCookie(AUTH_COOKIE, options);
  res.json({ ok: true });
}

export async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.user.id);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
}
