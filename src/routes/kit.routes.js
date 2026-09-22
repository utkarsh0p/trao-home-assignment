import { Router } from 'express';

import * as kit from '../controllers/kit.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// Every kit route is private, and the service layer additionally scopes each query
// by the signed-in user.
router.use(requireAuth);

router.get('/', kit.list);
router.get('/:id', kit.get);
router.get('/:id/export', kit.exportKit);
router.delete('/:id', kit.remove);

// Declared before '/:id/questions/:qid' — otherwise Express matches "reorder" as a qid.
router.patch('/:id/questions/reorder', validateBody(kit.reorderSchema), kit.reorderQuestions);
router.post('/:id/questions', validateBody(kit.questionCreateSchema), kit.addQuestion);
router.patch('/:id/questions/:qid', validateBody(kit.questionPatchSchema), kit.updateQuestion);
router.delete('/:id/questions/:qid', kit.deleteQuestion);

router.post('/:id/flashcards', validateBody(kit.flashcardCreateSchema), kit.addFlashcard);
router.patch('/:id/flashcards/:fid', validateBody(kit.flashcardPatchSchema), kit.updateFlashcard);
router.delete('/:id/flashcards/:fid', kit.deleteFlashcard);

router.patch('/:id/brief', validateBody(kit.briefPatchSchema), kit.updateBrief);

router.get('/:id/practice/next', kit.practiceNext);
router.post('/:id/practice/:fid', validateBody(kit.confidenceSchema), kit.recordConfidence);

router.post(
  '/:id/regenerate',
  generationLimiter,
  validateBody(kit.regenerateSchema),
  kit.regenerate,
);

export default router;
