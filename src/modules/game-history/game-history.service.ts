import { Prisma } from '../../generated/prisma/client';
import prisma from '../../config/prisma';

export interface CreateGameHistoryData {
  state_id: number;
  game_id: number;
  draw_date: Date;
  draw_time: 'MID' | 'EVE';
  winning_numbers: string;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  prize_amount?: number;
}

export interface UpdateGameHistoryData {
  state_id?: number;
  game_id?: number;
  draw_date?: Date;
  draw_time?: 'MID' | 'EVE';
  winning_numbers?: string;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  prize_amount?: number;
}

export interface GameHistoryFilters {
  search?: string;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  fromDate?: Date;
  toDate?: Date;
  sortBy?: 'drawDate' | 'resultStatus' | 'createdAt';
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

  // Normalize draw date
  const drawDate = new Date(data.draw_date);
  drawDate.setHours(0, 0, 0, 0);

  // Check for duplicate
  const isDuplicate = await checkDuplicateEntry(
    data.state_id,
    data.game_id,
    drawDate,
    data.draw_time
  );

  if (isDuplicate) {
    throw new Error('A game history entry already exists for this state, game type, draw date, and draw time');
  }

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
      resultStatus: data.result || 'PENDING',
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

  // Update draw_date if provided
  if (data.draw_date !== undefined) {
    const drawDate = new Date(data.draw_date);
    drawDate.setHours(0, 0, 0, 0);
    updateData.drawDate = drawDate;
  }

  // Update other fields
  if (data.draw_time !== undefined) {
    updateData.drawTime = data.draw_time;
  }

  if (data.winning_numbers !== undefined) {
    updateData.winningNumbers = data.winning_numbers.trim();
  }

  if (data.result !== undefined) {
    updateData.resultStatus = data.result;
  }

  if (data.prize_amount !== undefined) {
    updateData.prizeAmount = new Prisma.Decimal(data.prize_amount);
  }

  // Check for duplicate if state_id, game_id, draw_date, or draw_time are being updated
  const finalStateId = updateData.stateId || existingHistory.stateId;
  const finalGameTypeId = updateData.gameTypeId || existingHistory.gameTypeId;
  const finalDrawDate = updateData.drawDate || existingHistory.drawDate;
  const finalDrawTime = updateData.drawTime || existingHistory.drawTime;

  const isDuplicate = await checkDuplicateEntry(
    finalStateId,
    finalGameTypeId,
    finalDrawDate,
    finalDrawTime,
    id
  );

  if (isDuplicate) {
    throw new Error('A game history entry already exists for this state, game type, draw date, and draw time');
  }

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

  // Result filter
  if (filters.result) {
    where.resultStatus = filters.result;
  }

  // Date range filter
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

  // Build orderBy clause
  const orderBy: any = {};
  if (filters.sortBy === 'drawDate') {
    orderBy.drawDate = filters.sortOrder || 'desc';
  } else if (filters.sortBy === 'resultStatus') {
    orderBy.resultStatus = filters.sortOrder || 'desc';
  } else if (filters.sortBy === 'createdAt') {
    orderBy.createdAt = filters.sortOrder || 'desc';
  } else {
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
    select: { id: true },
  });

  if (!existingHistory) {
    throw new Error('Game history not found');
  }

  // Delete the record
  await prisma.gameHistory.delete({
    where: { id },
  });

  return { success: true };
};

