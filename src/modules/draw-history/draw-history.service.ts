import { Prisma } from '../../generated/prisma/client';
import prisma from '../../config/prisma';

export interface DrawHistoryFilters {
  search?: string; // Search by winning number, draw date, or draw time
  stateId?: number;
  fromDate?: Date;
  toDate?: Date;
  sortBy?: 'drawDate' | 'winningNumbers';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationParams {
  page: number;
  limit: number;
}

// Format draw history response for public API
const formatDrawHistoryResponse = (history: any) => ({
  id: history.id,
  draw_date: history.drawDate,
  draw_time: history.drawTime,
  winning_numbers: history.winningNumbers,
  prize_amount: history.prizeAmount?.toNumber() || 0,
  total_winners: history.totalWinners,
  state_name: history.state.name,
  state_code: history.state.code,
  game_name: history.gameType.name,
  game_code: history.gameType.code,
});

// Get all draw histories for public API with filters and pagination
export const getPublicDrawHistories = async (filters: DrawHistoryFilters, pagination: PaginationParams) => {
  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  // State filter
  if (filters.stateId) {
    where.stateId = filters.stateId;
  }

  // Date range filter (start: 00:00:01, end: 23:59:59)
  // This takes precedence over date search if both are provided
  if (filters.fromDate || filters.toDate) {
    where.drawDate = {};
    if (filters.fromDate) {
      const from = new Date(filters.fromDate);
      from.setHours(0, 0, 0, 1); // Start at 00:00:01
      where.drawDate.gte = from;
    }
    if (filters.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999); // End at 23:59:59
      where.drawDate.lte = to;
    }
  }

  // Search filter (winning number, draw date, or draw time)
  // Only add date search if date range filter is not provided
  if (filters.search) {
    const searchConditions: any[] = [
      {
        winningNumbers: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
      {
        drawTime: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
    ];

    // Try to parse as date if search looks like a date
    // Only add date search if date range filter is not already set
    if (!where.drawDate) {
      const dateMatch = filters.search.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        try {
          const searchDate = new Date(dateMatch[0]);
          if (!isNaN(searchDate.getTime())) {
            const startOfDay = new Date(searchDate);
            startOfDay.setHours(0, 0, 0, 1);
            const endOfDay = new Date(searchDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            searchConditions.push({
              drawDate: {
                gte: startOfDay,
                lte: endOfDay,
              },
            });
          }
        } catch (e) {
          // Ignore date parsing errors
        }
      }
    }

    where.OR = searchConditions;
  }

  // Build orderBy clause
  const orderBy: any = {};
  if (filters.sortBy === 'drawDate') {
    orderBy.drawDate = filters.sortOrder || 'desc';
  } else if (filters.sortBy === 'winningNumbers') {
    orderBy.winningNumbers = filters.sortOrder || 'asc';
  } else {
    // Default to drawDate desc
    orderBy.drawDate = 'desc';
  }

  // Get draw histories with pagination
  const [drawHistories, total] = await Promise.all([
    prisma.gameHistory.findMany({
      where,
      include: {
        state: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        gameType: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy,
    }),
    prisma.gameHistory.count({ where }),
  ]);

  return {
    draw_histories: drawHistories.map(formatDrawHistoryResponse),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};
