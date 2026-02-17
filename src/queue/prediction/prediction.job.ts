import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../../config/redis';

export interface PredictionJobData {
  stateId: number;
}

// Create queue with proper error handling
let predictionQueue: Queue<PredictionJobData> | null = null;

try {
  predictionQueue = new Queue<PredictionJobData>('prediction', {
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
  predictionQueue.on('error', (error) => {
    console.error('Prediction queue error:', error.message);
  });
} catch (error) {
  console.error('Failed to initialize prediction queue:', error);
  console.warn('Queue functionality will not be available until Redis is connected');
}

// Export queue with null check helper
export const getPredictionQueue = (): Queue<PredictionJobData> => {
  if (!predictionQueue) {
    throw new Error('Prediction queue is not initialized. Redis may not be available.');
  }
  return predictionQueue;
};

export { predictionQueue };
export default predictionQueue;
