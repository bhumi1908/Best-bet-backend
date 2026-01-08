import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus } from '../../utils/constants/enums';
import * as gameTypesService from './game-types.service';

// GET /api/game-types - Get all active game types (public endpoint)
export const getAllGameTypes = async (req: Request, res: Response): Promise<void> => {
  try {
    const gameTypes = await gameTypesService.getAllGameTypes();

    sendSuccess(
      res,
      {
        game_types: gameTypes,
        count: gameTypes.length,
      },
      gameTypes.length > 0
        ? 'Game types retrieved successfully'
        : 'No active game types found'
    );
  } catch (error: any) {
    console.error('Get all game types error:', error);

    if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
      sendError(
        res,
        'Database connection failed. Please check your database configuration and ensure PostgreSQL is running.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to retrieve game types',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
