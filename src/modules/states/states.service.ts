import prisma from '../../config/prisma';

export interface StateResponse {
  id: number;
  state_code: string | null;
  state_name: string;
}

// Get all active states
export const getAllStates = async (): Promise<StateResponse[]> => {
  const states = await prisma.state.findMany({
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
      name: 'asc', // Sort alphabetically by state name
    },
  });

  return states.map((state) => ({
    id: state.id,
    state_code: state.code,
    state_name: state.name,
  }));
};
