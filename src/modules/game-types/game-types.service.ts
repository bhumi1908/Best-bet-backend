import prisma from '../../config/prisma';

export interface GameTypeResponse {
  id: number;
  game_code: string;
  game_name: string;
}

// Get all active game types
export const getAllGameTypes = async (): Promise<GameTypeResponse[]> => {
  const gameTypes = await prisma.gameType.findMany({
    where: {
      isActive: true,
      isDeleted: false,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: {
      name: 'asc', // Sort alphabetically by game type name
    },
  });

  return gameTypes.map((gameType) => ({
    id: gameType.id,
    game_code: gameType.code,
    game_name: gameType.name,
  }));
};
