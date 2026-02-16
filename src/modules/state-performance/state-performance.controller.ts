import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus } from '../../utils/constants/enums';
import * as statePerformanceService from './state-performance.service';

/**
 * GET /api/state-performance - Get state performance data
 * Public endpoint - no authentication required
 */
export const getStatePerformance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { state, gameId } = req.query;

    // Validation
    if (!state || typeof state !== 'string') {
      sendError(res, 'State parameter is required', HttpStatus.BAD_REQUEST);
      return;
    }

    let parsedGameId: number | undefined;
    if (gameId !== undefined) {
      parsedGameId = parseInt(gameId as string, 10);
      if (isNaN(parsedGameId) || (parsedGameId !== 1 && parsedGameId !== 2)) {
        sendError(res, 'Invalid gameId. Must be 1 or 2', HttpStatus.BAD_REQUEST);
        return;
      }
    }

    const performanceData = await statePerformanceService.getStatePerformance(
      state as string,
      parsedGameId
    );

    sendSuccess(
      res,
      performanceData,
      'State performance data retrieved successfully'
    );
  } catch (error: any) {
    console.error('[getStatePerformance] Error:', error);

    if (error?.message?.includes('not found')) {
      sendError(res, error.message, HttpStatus.NOT_FOUND);
      return;
    }

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
      error?.message || 'Failed to retrieve state performance data',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
