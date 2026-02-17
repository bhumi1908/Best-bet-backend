import { Router } from 'express';
import { getStatePerformance } from './state-performance.controller';
import { validateQuery } from '../../middleware/validateDto';
import { getStatePerformanceQuerySchema } from './state-performance.validation';

const router = Router();

// Public route - GET /api/state-performance
router.get(
  '/',
  validateQuery(getStatePerformanceQuerySchema),
  getStatePerformance
);

export default router;
