import { Router } from 'express';

import * as job from '../controllers/job.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth);

router.post('/', generationLimiter, validateBody(job.createJobSchema), job.create);
router.get('/:id', job.status);

export default router;
