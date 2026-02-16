import { Prisma } from '../../generated/prisma/client';
import prisma from '../../config/prisma';

export interface CreateGameHistoryData {
  state_id: number;
  game_id: number;
  draw_date: Date;
  draw_time: 'MID' | 'EVE';
  winning_numbers: string;
  // COMMENTED OUT: Result Status flow
  // result?: 'WIN' | 'LOSS' | 'PENDING';
  prize_amount?: number;
}

export interface UpdateGameHistoryData {
  state_id?: number;
  game_id?: number;
  draw_date?: Date;
  draw_time?: 'MID' | 'EVE';
  winning_numbers?: string;
  // COMMENTED OUT: Result Status flow
  // result?: 'WIN' | 'LOSS' | 'PENDING';
  prize_amount?: number;
}

export interface GameHistoryFilters {
  search?: string;
  // COMMENTED OUT: Result Status flow
  // result?: 'WIN' | 'LOSS' | 'PENDING';
  fromDate?: Date;
  toDate?: Date;
  sortBy?: 'drawDate' | /* 'resultStatus' | */ 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationParams {
  page: number;
  limit: number;
}

// Validate state exists and is active
export const validateState = async (stateId: number): Promise<{ valid: boolean; error?: string }> => {
  const state = await prisma.state.findUnique({
    where: { id: stateId },
    select: { id: true, isActive: true, isDeleted: true },
  });

  if (!state) {
    return { valid: false, error: 'State not found' };
  }

  if (state.isDeleted || !state.isActive) {
    return { valid: false, error: 'State is not active' };
  }

  return { valid: true };
};

// Validate game type exists and is active
export const validateGameType = async (gameTypeId: number): Promise<{ valid: boolean; error?: string }> => {
  const gameType = await prisma.gameType.findUnique({
    where: { id: gameTypeId },
    select: { id: true, isActive: true, isDeleted: true },
  });

  if (!gameType) {
    return { valid: false, error: 'Game type not found' };
  }

  if (gameType.isDeleted || !gameType.isActive) {
    return { valid: false, error: 'Game type is not active' };
  }

  return { valid: true };
};

// Check for duplicate game history entry
export const checkDuplicateEntry = async (
  stateId: number,
  gameTypeId: number,
  drawDate: Date,
  drawTime: 'MID' | 'EVE',
  excludeId?: number
): Promise<boolean> => {
  const normalizedDrawDate = new Date(drawDate);
  normalizedDrawDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(normalizedDrawDate.getTime() + 24 * 60 * 60 * 1000);

  const where: any = {
    stateId,
    gameTypeId,
    drawDate: {
      gte: normalizedDrawDate,
      lt: nextDay,
    },
    drawTime,
  };

  if (excludeId) {
    where.id = { not: excludeId };
  }

  const existing = await prisma.gameHistory.findFirst({ where });
  return !!existing;
};

// Create game history
export const createGameHistory = async (data: CreateGameHistoryData) => {
  // Validate state
  const stateValidation = await validateState(data.state_id);
  if (!stateValidation.valid) {
    throw new Error(stateValidation.error);
  }

  // Validate game type
  const gameTypeValidation = await validateGameType(data.game_id);
  if (!gameTypeValidation.valid) {
    throw new Error(gameTypeValidation.error);
  }

  const drawDate = new Date(data.draw_date);

  // Allow admin to create even if duplicate exists (removed duplicate check)

  // Convert prize_amount to Decimal
  const prizeAmount = data.prize_amount !== undefined
    ? new Prisma.Decimal(data.prize_amount)
    : new Prisma.Decimal(0);

  // Create game history
  const gameHistory = await prisma.gameHistory.create({
    data: {
      stateId: data.state_id,
      gameTypeId: data.game_id,
      drawDate,
      drawTime: data.draw_time,
      winningNumbers: data.winning_numbers.trim(),
      // COMMENTED OUT: Result Status flow - default to PENDING for backward compatibility
      resultStatus: 'PENDING', // data.result || 'PENDING',
      totalWinners: 0,
      prizeAmount,
    },
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
  });

  return gameHistory;
};

// Update game history
export const updateGameHistory = async (id: number, data: UpdateGameHistoryData) => {
  // Check if game history exists
  const existingHistory = await prisma.gameHistory.findUnique({
    where: { id },
    include: {
      state: true,
      gameType: true,
    },
  });

  if (!existingHistory) {
    throw new Error('Game history not found');
  }

  // Build update data
  const updateData: any = {};

  // Validate and update state_id if provided
  if (data.state_id !== undefined) {
    const stateValidation = await validateState(data.state_id);
    if (!stateValidation.valid) {
      throw new Error(stateValidation.error);
    }
    updateData.stateId = data.state_id;
  }

  // Validate and update game_id if provided
  if (data.game_id !== undefined) {
    const gameTypeValidation = await validateGameType(data.game_id);
    if (!gameTypeValidation.valid) {
      throw new Error(gameTypeValidation.error);
    }
    updateData.gameTypeId = data.game_id;
  }

  // Update draw_date if provided (should already be parsed in controller as local timezone date)
  if (data.draw_date !== undefined) {
    // Ensure it's at start of day (00:00:00) in local timezone
    // const drawDate = data.draw_date instanceof Date
    //   ? new Date(data.draw_date.getFullYear(), data.draw_date.getMonth(), data.draw_date.getDate(), 0, 0, 0, 0)
    //   : (() => {
    //     // Fallback: parse string if somehow it's not a Date (shouldn't happen after controller fix)
    //     const parsed = new Date(data.draw_date);
    //     return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
    //   })();
    const drawDate = new Date(data.draw_date);
    updateData.drawDate = drawDate;
  }

  // Update other fields
  if (data.draw_time !== undefined) {
    updateData.drawTime = data.draw_time;
  }

  if (data.winning_numbers !== undefined) {
    updateData.winningNumbers = data.winning_numbers.trim();
  }

  // COMMENTED OUT: Result Status flow
  // if (data.result !== undefined) {
  //   updateData.resultStatus = data.result;
  // }

  if (data.prize_amount !== undefined) {
    updateData.prizeAmount = new Prisma.Decimal(data.prize_amount);
  }

  // Allow admin to update even if duplicate exists (removed duplicate check)

  // Update game history
  const updatedHistory = await prisma.gameHistory.update({
    where: { id },
    data: updateData,
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
  });

  return updatedHistory;
};

// Get all game histories with filters and pagination
export const getGameHistories = async (filters: GameHistoryFilters, pagination: PaginationParams) => {
  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  // Search filter (state name, game type name, or winning numbers)
  if (filters.search) {
    where.OR = [
      {
        state: {
          name: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
      },
      {
        gameType: {
          name: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
      },
      {
        winningNumbers: {
          contains: filters.search,
          mode: 'insensitive',
        },
      },
    ];
  }

  // COMMENTED OUT: Result Status flow
  // Result filter
  // if (filters.result) {
  //   where.resultStatus = filters.result;
  // }

  // Date range filter
  if (filters.fromDate || filters.toDate) {
    where.drawDate = {};
    if (filters.fromDate) {
      const fromDate = new Date(filters.fromDate);
      fromDate.setUTCHours(0, 0, 0, 0);
      where.drawDate.gte = fromDate;
    }
    if (filters.toDate) {
      const endOfDay = new Date(filters.toDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.drawDate.lte = endOfDay;
    }
  }

  // Build orderBy clause
  const orderBy: any = {};
  // check if any filter is applied
  const hasAnyFilter =
    filters.search ||
    // COMMENTED OUT: Result Status flow
    // filters.result ||
    filters.fromDate ||
    filters.toDate;

  if (filters.sortBy === 'drawDate') {
    orderBy.drawDate = filters.sortOrder || 'desc';
  // COMMENTED OUT: Result Status flow
  // } else if (filters.sortBy === 'resultStatus') {
  //   orderBy.resultStatus = filters.sortOrder || 'desc';
  } else if (filters.sortBy === 'createdAt') {
    orderBy.createdAt = filters.sortOrder || 'desc';
  } else if (!hasAnyFilter) {
    orderBy.createdAt = 'desc';
  }
  else {
    // Default to drawDate desc
    orderBy.drawDate = 'desc';
  }


  // Get game histories with pagination
  const [gameHistories, total] = await Promise.all([
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
    gameHistories,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// Get game history by ID
export const getGameHistoryById = async (id: number) => {
  const gameHistory = await prisma.gameHistory.findUnique({
    where: { id },
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
  });

  if (!gameHistory) {
    throw new Error('Game history not found');
  }

  return gameHistory;
};

// Delete game history
export const deleteGameHistory = async (id: number) => {
  // Check if game history exists
  const existingHistory = await prisma.gameHistory.findUnique({
    where: { id },
    select: { id: true, stateId:true },
  });

  if (!existingHistory) {
    throw new Error('Game history not found');
  }

  // Delete the record
  await prisma.gameHistory.delete({
    where: { id },
  });

  return { success: true,   stateId: existingHistory.stateId,};
};

