import { Router } from 'express';
import {
  getPredictionsStatus,
  getLatestPredictions,
  getProofOfPerformance,
} from './predictions.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireActiveSubscription } from '../../middleware/subscriptionAuth';
import { validateQuery, validateParams } from '../../middleware/validateDto';
import {
  getLatestPredictionsQuerySchema,
  getPredictionsStatusParamsSchema,
} from './predictions.validation';

const router = Router();

// Public endpoint - no authentication required
router.get('/proof-of-performance', getProofOfPerformance);

router.get(
  '/:jobId/status',
  authenticateToken,
  validateParams(getPredictionsStatusParamsSchema),
  getPredictionsStatus
);

router.get(
  '/latest',
  authenticateToken,
  requireActiveSubscription,
  validateQuery(getLatestPredictionsQuerySchema),
  getLatestPredictions
);

export default router;
