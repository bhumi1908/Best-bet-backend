import { Prisma } from '../../generated/prisma/client';
import prisma from '../../config/prisma';

export interface DrawHistoryFilters {
  search?: string; // Search by winning number, draw date, or draw time
  stateId?: number;
  drawTime?: string; // Filter by draw time (e.g., "Midday", "Evening", "12:00 PM", "11:00 PM")
  fromDate?: Date;
  toDate?: Date;
  sortBy?: 'drawDate' | 'winningNumbers';
  sortOrder?: 'asc' | 'desc';
}

// Format draw history response for public API
const formatDrawHistoryResponse = (history: any) => {
  // Format date as YYYY-MM-DD in local timezone (not UTC)
  const drawDate = history.drawDate instanceof Date ? history.drawDate : new Date(history.drawDate);
  const year = drawDate.getFullYear();
  const month = String(drawDate.getMonth() + 1).padStart(2, '0');
  const day = String(drawDate.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;

  return {
    id: history.id,
    draw_date: formattedDate, // Format as YYYY-MM-DD in local timezone
    draw_time: history.drawTime, // Enum: 'MID' or 'EVE'
    winning_numbers: history.winningNumbers,
    prize_amount: history.prizeAmount?.toNumber() || 0,
    total_winners: history.totalWinners,
    state_name: history.state.name,
    state_code: history.state.code,
    game_name: history.gameType.name,
    game_code: history.gameType.code,
  };
};

// Get all draw histories for public API with filters (no pagination)
export const getPublicDrawHistories = async (filters: DrawHistoryFilters) => {
  // Build where clause
  const where: any = {};

  // State filter
  if (filters.stateId) {
    where.stateId = filters.stateId;
  }

  // Draw time filter (enum: MID or EVE)
  if (filters.drawTime) {
    // Convert frontend values to enum values
    const drawTimeUpper = filters.drawTime.toUpperCase();
    if (drawTimeUpper === 'MIDDAY' || drawTimeUpper === 'MID') {
      where.drawTime = 'MID';
    } else if (drawTimeUpper === 'EVENING' || drawTimeUpper === 'EVE') {
      where.drawTime = 'EVE';
    } else if (drawTimeUpper === 'MID' || drawTimeUpper === 'EVE') {
      // Already in correct format
      where.drawTime = drawTimeUpper as 'MID' | 'EVE';
    }
  }

  // Date range filter (inclusive of both start and end dates)
  // Dates are already properly formatted in the controller
  if (filters.fromDate || filters.toDate) {
    where.drawDate = {};
    if (filters.fromDate) {
      // Use the date as-is (already set to start of day in controller)
      const fromDate = new Date(filters.fromDate);
      fromDate.setHours(0, 0, 0, 1);
      where.drawDate.gte = filters.fromDate;
    }
    if (filters.toDate) {
      const endOfDay = new Date(filters.toDate);
      endOfDay.setHours(23, 59, 59, 999);
      // Use the date as-is (already set to end of day in controller)
      where.drawDate.lte = filters.toDate;
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
    ];  

    // Handle draw time search (enum: MID or EVE)
    const searchUpper = filters.search.toUpperCase();
    if (searchUpper === 'MIDDAY' || searchUpper === 'MID') {
      searchConditions.push({ drawTime: 'MID' });
    } else if (searchUpper === 'EVENING' || searchUpper === 'EVE') {
      searchConditions.push({ drawTime: 'EVE' });
    }

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

  // Get all draw histories (no pagination)
  const drawHistories = await prisma.gameHistory.findMany({
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
    orderBy,
  });

  return {
    draw_histories: drawHistories.map(formatDrawHistoryResponse),
  };
};
