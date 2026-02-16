import { Worker } from 'bullmq';
import { redisConnectionOptions, checkRedisConnection } from '../../config/redis';
import { getPredictionQueue, PredictionJobData } from './prediction.job';
import { processPrediction } from './prediction.processor';

/**
 * Worker to process prediction jobs
 * Only initialize if Redis is available
 */
let predictionWorker: Worker<PredictionJobData> | null = null;

// Initialize worker with error handling and retry logic
async function initializeWorker(retryCount: number = 0): Promise<void> {
  const maxRetries = 5;
  const retryDelay = 3000; // 3 seconds

  try {
    // Check Redis connection before creating worker
    const isRedisAvailable = await checkRedisConnection();

    if (!isRedisAvailable) {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          initializeWorker(retryCount + 1).catch((error) => {
            console.error(`[PredictionWorker] Error during retry initialization:`, error);
          });
        }, retryDelay);
        return;
      } else {
        return;
      }
    }

    // CRITICAL: Ensure queue exists and is ready before creating worker
    try {
      const queue = getPredictionQueue();
      await queue.waitUntilReady();
    } catch (err) {
      console.warn('[PredictionWorker] Could not verify queue readiness:', err);
    }

    // CRITICAL: Create worker with processor function
    // Concurrency is set to 1 to ensure only one job processes at a time per worker
    // This prevents Google Sheets API rate limit issues when multiple states are processed
    predictionWorker = new Worker<PredictionJobData>(
      'prediction', // Queue name - MUST match the queue name used in prediction.job.ts
      async (job) => {
        return await processPrediction(job);
      },
      {
        connection: redisConnectionOptions,
        concurrency: 1, // Process one job at a time to prevent Google Sheets API conflicts
        limiter: {
          max: 10, // Max 10 jobs
          duration: 60000, // Per 60 seconds
        },
        maxStalledCount: 1, // Prevent infinite stalled retries
        // IMPORTANT: These settings ensure worker is ready
        skipLockRenewal: false, // Keep lock renewal active
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      }
    );

    // Check queue status to verify connection
    try {
      const queue = getPredictionQueue();
      await queue.waitUntilReady();
    } catch (err) {
      console.warn(`[PredictionWorker] Could not verify queue status:`, err);
    }

  } catch (error) {
    // Retry initialization if not at max retries
    if (retryCount < maxRetries) {
      setTimeout(() => {
        initializeWorker(retryCount + 1).catch((err) => {
          console.error(`[PredictionWorker] Error during retry initialization:`, err);
        });
      }, retryDelay);
    }
  }
}

// Initialize worker (async, but don't block)
// This will be called on module import, but we also export a function to await initialization
let initializationPromise: Promise<void> | null = null;

export async function ensureWorkerInitialized(): Promise<void> {
  if (predictionWorker && predictionWorker.isRunning()) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = initializeWorker(0);
  await initializationPromise;
  initializationPromise = null;
}

// Start initialization in background (non-blocking)
initializeWorker().catch((error) => {
  console.error('Error during prediction worker initialization:', error);
});

// Export worker with null check helper
export const getPredictionWorker = (): Worker<PredictionJobData> | null => {
  if (!predictionWorker) {
    console.warn('[PredictionWorker] getPredictionWorker() called but worker is NULL');
  }
  return predictionWorker;
};

// Function to manually reinitialize worker (useful if Redis comes online later)
export async function reinitializeWorker(): Promise<boolean> {

  // Close existing worker if it exists
  if (predictionWorker) {
    await predictionWorker.close();
    predictionWorker = null;
  }

  // Reinitialize
  try {
    await initializeWorker(0);
    return predictionWorker !== null;
  } catch (error) {
    console.error(`[PredictionWorker] Failed to reinitialize worker:`, error);
    return false;
  }
}

export { predictionWorker };
export default predictionWorker;
