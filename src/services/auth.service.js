import bcrypt from 'bcryptjs';

import { User } from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';

const SALT_ROUNDS = 10;

export async function registerUser({ email, password }) {
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'An account with that email already exists.', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return User.create({ email, passwordHash });
}

export async function authenticate({ email, password }) {
  const user = await User.findOne({ email });

  // Unknown email and wrong password return the same error, so the endpoint cannot
  // be used to discover which addresses have accounts.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!ok) {
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
  }

  return user;
}

export async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);
  return user;
}
