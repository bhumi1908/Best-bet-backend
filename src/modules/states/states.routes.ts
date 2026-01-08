import { Router } from 'express';
import { getAllStates } from './states.controller';

const router = Router();

// Public route - GET /api/states
router.get('/', getAllStates);

export default router;
