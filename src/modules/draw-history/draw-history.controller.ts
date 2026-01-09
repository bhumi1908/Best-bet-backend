import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus } from '../../utils/constants/enums';
import * as drawHistoryService from './draw-history.service';

// GET /api/draw-history - Get all draw histories (public endpoint)
export const getDrawHistories = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const stateId = req.query.stateId ? parseInt(req.query.stateId as string) : undefined;
    const drawTime = req.query.drawTime as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'drawDate';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    // Validate sortBy
    if (sortBy && !['drawDate', 'winningNumbers'].includes(sortBy)) {
      sendError(res, 'Invalid sortBy parameter. Must be "drawDate" or "winningNumbers"', HttpStatus.BAD_REQUEST);
      return;
    }

    // Validate sortOrder
    if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
      sendError(res, 'Invalid sortOrder parameter. Must be "asc" or "desc"', HttpStatus.BAD_REQUEST);
      return;
    }

    // Validate stateId
    if (stateId && (isNaN(stateId) || stateId < 1)) {
      sendError(res, 'Invalid stateId parameter', HttpStatus.BAD_REQUEST);
      return;
    }

    const filters: drawHistoryService.DrawHistoryFilters = {
      search,
      stateId,
      drawTime,
      fromDate:  fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      sortBy: sortBy as 'drawDate' | 'winningNumbers',
      sortOrder,
    };

    const result = await drawHistoryService.getPublicDrawHistories(filters);

    sendSuccess(
      res,
      {
        draw_histories: result.draw_histories,
      },
      'Draw histories retrieved successfully'
    );
  } catch (error: any) {
    console.error('Get draw histories error:', error);

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
      error?.message || 'Failed to retrieve draw histories',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
