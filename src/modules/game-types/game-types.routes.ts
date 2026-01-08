import { Router } from 'express';
import { getAllGameTypes } from './game-types.controller';

const router = Router();

// Public route - GET /api/game-types
router.get('/', getAllGameTypes);

export default router;
