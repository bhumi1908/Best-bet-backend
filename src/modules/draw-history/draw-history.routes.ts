import { Router } from 'express';
import { getDrawHistories } from './draw-history.controller';
import { validateQuery } from '../../middleware/validateDto';
import { getDrawHistoriesQuerySchema } from './draw-history.validation';

const router = Router();

// Public route - GET /api/draw-history
// No authentication required - this is a public endpoint
router.get(
  '/',
  validateQuery(getDrawHistoriesQuerySchema),
  getDrawHistories
);

export default router;
