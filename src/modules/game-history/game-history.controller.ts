import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus } from '../../utils/constants/enums';
import * as gameHistoryService from './game-history.service';

// Helper function to format game history response
const formatGameHistoryResponse = (history: any) => ({
  id: history.id,
  state_id: history.stateId,
  state_name: history.state.name,
  state_code: history.state.code,
  game_id: history.gameTypeId,
  game_name: history.gameType.name,
  game_code: history.gameType.code,
  draw_date: history.drawDate,
  draw_time: history.drawTime,
  winning_numbers: history.winningNumbers,
  result: history.resultStatus,
  total_winners: history.totalWinners,
  prize_amount: history.prizeAmount?.toNumber() || 0,
  created_at: history.createdAt,
  updated_at: history.updatedAt,
});

// POST /api/game-history - Create game history
export const createGameHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { state_id, game_id, draw_date, draw_time, winning_numbers, result, prize_amount } = req.body;

    const gameHistory = await gameHistoryService.createGameHistory({
      state_id,
      game_id,
      draw_date,
      draw_time,
      winning_numbers,
      result,
      prize_amount,
    });

    sendSuccess(
      res,
      formatGameHistoryResponse(gameHistory),
      'Game history created successfully',
      HttpStatus.CREATED
    );
  } catch (error: any) {
    console.error('Create game history error:', error);

    if (error?.code === 'P2002') {
      sendError(
        res,
        'A game history entry already exists for this state, game type, draw date, and draw time',
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    if (error?.code === 'P2003') {
      sendError(res, 'Invalid state or game type reference', HttpStatus.BAD_REQUEST);
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

    // Handle service layer errors
    if (error.message) {
      const statusCode = error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      sendError(res, error.message, statusCode);
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to create game history',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// PUT /api/game-history/{gameHistoryId} - Update game history
export const updateGameHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const gameHistoryId = parseInt(req.params.gameHistoryId);
    const { state_id, game_id, draw_date, draw_time, winning_numbers, result, prize_amount } = req.body;

    if (isNaN(gameHistoryId)) {
      sendError(res, 'Invalid game history ID', HttpStatus.BAD_REQUEST);
      return;
    }

    const updatedHistory = await gameHistoryService.updateGameHistory(gameHistoryId, {
      state_id,
      game_id,
      draw_date,
      draw_time,
      winning_numbers,
      result,
      prize_amount,
    });

    sendSuccess(
      res,
      formatGameHistoryResponse(updatedHistory),
      'Game history updated successfully'
    );
  } catch (error: any) {
    console.error('Update game history error:', error);

    if (error?.code === 'P2025') {
      sendError(res, 'Game history not found', HttpStatus.NOT_FOUND);
      return;
    }

    if (error?.code === 'P2002') {
      sendError(
        res,
        'A game history entry already exists for this state, game type, draw date, and draw time',
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    if (error?.code === 'P2003') {
      sendError(res, 'Invalid state or game type reference', HttpStatus.BAD_REQUEST);
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

    // Handle service layer errors
    if (error.message) {
      const statusCode = error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      sendError(res, error.message, statusCode);
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to update game history',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// GET /api/game-histories - Get all game histories with filters and pagination
export const getGameHistories = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string | undefined;
    const result = req.query.result as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'drawDate';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const filters: gameHistoryService.GameHistoryFilters = {
      search,
      result: result as 'WIN' | 'LOSS' | 'PENDING' | undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      sortBy: sortBy as 'drawDate' | 'resultStatus' | 'createdAt',
      sortOrder,
    };

    const { gameHistories, total, totalPages } = await gameHistoryService.getGameHistories(
      filters,
      { page, limit }
    );

    // Format response
    const formattedHistories = gameHistories.map(formatGameHistoryResponse);

    sendSuccess(
      res,
      {
        game_histories: formattedHistories,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      'Game histories retrieved successfully'
    );
  } catch (error: any) {
    console.error('Get game histories error:', error);

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
      error?.message || 'Failed to retrieve game histories',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// GET /api/game-histories/{gameHistoryId} - Get game history by ID
export const getGameHistoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    const gameHistoryId = parseInt(req.params.gameHistoryId);

    if (isNaN(gameHistoryId)) {
      sendError(res, 'Invalid game history ID', HttpStatus.BAD_REQUEST);
      return;
    }

    const gameHistory = await gameHistoryService.getGameHistoryById(gameHistoryId);

    sendSuccess(
      res,
      formatGameHistoryResponse(gameHistory),
      'Game history retrieved successfully'
    );
  } catch (error: any) {
    console.error('Get game history by ID error:', error);

    if (error?.code === 'P2025') {
      sendError(res, 'Game history not found', HttpStatus.NOT_FOUND);
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

    // Handle service layer errors
    if (error.message && error.message.includes('not found')) {
      sendError(res, error.message, HttpStatus.NOT_FOUND);
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to retrieve game history',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// DELETE /api/game-histories/{gameHistoryId} - Delete game history
export const deleteGameHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const gameHistoryId = parseInt(req.params.gameHistoryId);

    if (isNaN(gameHistoryId)) {
      sendError(res, 'Invalid game history ID', HttpStatus.BAD_REQUEST);
      return;
    }

    await gameHistoryService.deleteGameHistory(gameHistoryId);

    sendSuccess(
      res,
      null,
      'Game history deleted successfully'
    );
  } catch (error: any) {
    console.error('Delete game history error:', error);

    if (error?.code === 'P2025') {
      sendError(res, 'Game history not found', HttpStatus.NOT_FOUND);
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

    // Handle service layer errors
    if (error.message && error.message.includes('not found')) {
      sendError(res, error.message, HttpStatus.NOT_FOUND);
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to delete game history',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

