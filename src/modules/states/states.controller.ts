import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus } from '../../utils/constants/enums';
import * as statesService from './states.service';

// GET /api/states - Get all active states (public endpoint)
export const getAllStates = async (req: Request, res: Response): Promise<void> => {
  try {
    const states = await statesService.getAllStates();

    sendSuccess(
      res,
      {
        states,
        count: states.length,
      },
      states.length > 0
        ? 'States retrieved successfully'
        : 'No active states found'
    );
  } catch (error: any) {
    console.error('Get all states error:', error);

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
      error?.message || 'Failed to retrieve states',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
