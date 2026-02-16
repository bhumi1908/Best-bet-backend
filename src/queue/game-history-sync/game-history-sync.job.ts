import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../../config/redis';

export interface GameHistorySyncJobData {
  apiUrl: string;
}

// Create queue with proper error handling
let gameHistorySyncQueue: Queue<GameHistorySyncJobData> | null = null;

try {
  gameHistorySyncQueue = new Queue<GameHistorySyncJobData>('game-history-sync', {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });

  // Handle queue errors
  gameHistorySyncQueue.on('error', (error) => {
    console.error('Game history sync queue error:', error.message);
  });
} catch (error) {
  console.error('Failed to initialize game history sync queue:', error);
  console.warn('Queue functionality will not be available until Redis is connected');
}

// Export queue with null check helper
export const getGameHistorySyncQueue = (): Queue<GameHistorySyncJobData> => {
  if (!gameHistorySyncQueue) {
    throw new Error('Game history sync queue is not initialized. Redis may not be available.');
  }
  return gameHistorySyncQueue;
};

export { gameHistorySyncQueue };
export default gameHistorySyncQueue;
