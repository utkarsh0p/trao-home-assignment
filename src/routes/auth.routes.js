import { Router } from 'express';

import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.post(
  '/register',
  authLimiter,
  validateBody(authController.credentialsSchema),
  authController.register,
);
router.post('/login', authLimiter, validateBody(authController.loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

export default router;
