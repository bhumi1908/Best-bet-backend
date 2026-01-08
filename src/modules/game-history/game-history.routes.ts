import { Router } from 'express';
import {
  createGameHistory,
  updateGameHistory,
  getGameHistories,
  getGameHistoryById,
  deleteGameHistory,
} from './game-history.controller';
import { validateDto, validateQuery } from '../../middleware/validateDto';
import {
  createGameHistorySchema,
  updateGameHistorySchema,
  getGameHistoriesQuerySchema,
} from './game-history.validation';
import { requireAdmin } from '../../middleware/adminAuth';
import { authenticateToken } from '../../middleware/auth';

// Router for /api/game-history (POST, PUT)
const gameHistoryRouter = Router();

// POST /api/game-history - Create game history
gameHistoryRouter.post(
  '/',
  authenticateToken,
  requireAdmin,
  validateDto(createGameHistorySchema),
  createGameHistory
);

// PUT /api/game-history/:gameHistoryId - Update game history
gameHistoryRouter.put(
  '/:gameHistoryId',
  authenticateToken,
  requireAdmin,
  validateDto(updateGameHistorySchema),
  updateGameHistory
);

// Router for /api/game-histories (GET, DELETE)
const gameHistoriesRouter = Router();

// GET /api/game-histories - Get all game histories with filters and pagination
gameHistoriesRouter.get(
  '/',
  authenticateToken,
  requireAdmin,
  validateQuery(getGameHistoriesQuerySchema),
  getGameHistories
);

// GET /api/game-histories/:gameHistoryId - Get game history by ID
gameHistoriesRouter.get(
  '/:gameHistoryId',
  authenticateToken,
  requireAdmin,
  getGameHistoryById
);

// DELETE /api/game-histories/:gameHistoryId - Delete game history
gameHistoriesRouter.delete(
  '/:gameHistoryId',
  authenticateToken,
  requireAdmin,
  deleteGameHistory
);

export { gameHistoryRouter, gameHistoriesRouter };
export default gameHistoryRouter; // Default export for backward compatibility
