import { Worker } from 'bullmq';
import { redisConnectionOptions, checkRedisConnection } from '../../config/redis';
import { getGameHistorySyncQueue, GameHistorySyncJobData } from './game-history-sync.job';
import { processGameHistorySync } from './game-history-sync.processor';

/**
 * Worker to process game history sync jobs
 * Only initialize if Redis is available
 * IMPORTANT: Concurrency is set to 1 to process jobs sequentially (line by line)
 */
let gameHistorySyncWorker: Worker<GameHistorySyncJobData> | null = null;

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
            console.error(`[GameHistorySyncWorker] Error during retry initialization:`, error);
          });
        }, retryDelay);
        return;
      } else {
        console.warn('[GameHistorySyncWorker] Redis not available yet. Worker not started.');
        return;
      }
    }

    // CRITICAL: Ensure queue exists and is ready before creating worker
    try {
      const queue = getGameHistorySyncQueue();
      await queue.waitUntilReady();
    } catch (err) {
      console.warn('[GameHistorySyncWorker] Could not verify queue readiness:', err);
    }

    // CRITICAL: Create worker with processor function
    // Concurrency is set to 1 to ensure jobs are processed sequentially (line by line)
    // This is important when multiple third-party APIs need to be processed one after another
    gameHistorySyncWorker = new Worker<GameHistorySyncJobData>(
      'game-history-sync', // Queue name - MUST match the queue name used in game-history-sync.job.ts
      async (job) => {
        return await processGameHistorySync(job);
      },
      {
        connection: redisConnectionOptions,
        concurrency: 1, // Process one job at a time (sequential processing)
        limiter: {
          max: 10, // Max 10 jobs
          duration: 60000, // Per 60 seconds
        },
        maxStalledCount: 1, // Prevent infinite stalled retries
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

    // Worker event handlers
    gameHistorySyncWorker.on('completed', (job) => {
      console.log(`[GameHistorySyncWorker] Job ${job.id} completed`);
    });

    gameHistorySyncWorker.on('failed', (job, err) => {
      console.error(`[GameHistorySyncWorker] Job ${job?.id} failed:`, err.message);
    });

    gameHistorySyncWorker.on('error', (error) => {
      console.error('[GameHistorySyncWorker] Worker error:', error);
    });

    console.log('[GameHistorySyncWorker] Worker initialized and ready (concurrency: 1 - sequential processing)');
  } catch (error) {
    // Retry initialization if not at max retries
    if (retryCount < maxRetries) {
      setTimeout(() => {
        initializeWorker(retryCount + 1).catch((err) => {
          console.error(`[GameHistorySyncWorker] Error during retry initialization:`, err);
        });
      }, retryDelay);
    }
  }
}

// Initialize worker (async, but don't block)
let initializationPromise: Promise<void> | null = null;

export async function ensureWorkerInitialized(): Promise<void> {
  if (gameHistorySyncWorker && gameHistorySyncWorker.isRunning()) {
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
  console.error('Error during game history sync worker initialization:', error);
});

// Retry every 10s until worker is created (covers startup race where Redis comes up later)
let initAttempts = 0;
const maxInitAttempts = 30; // 5 minutes max
const initInterval = setInterval(() => {
  if (gameHistorySyncWorker && gameHistorySyncWorker.isRunning()) {
    clearInterval(initInterval);
  } else if (initAttempts < maxInitAttempts) {
    initAttempts++;
    initializeWorker().catch(() => {
      // Ignore errors, will retry
    });
  } else {
    clearInterval(initInterval);
    console.warn(`[GameHistorySyncWorker] Still waiting for Redis... attempts=${initAttempts}`);
  }
}, 10000);

// Export worker with null check helper
export const getGameHistorySyncWorker = (): Worker<GameHistorySyncJobData> | null => {
  if (!gameHistorySyncWorker) {
    console.warn('[GameHistorySyncWorker] getGameHistorySyncWorker() called but worker is NULL');
  }
  return gameHistorySyncWorker;
};

// Function to manually reinitialize worker (useful if Redis comes online later)
export async function reinitializeWorker(): Promise<boolean> {
  // Close existing worker if it exists
  if (gameHistorySyncWorker) {
    await gameHistorySyncWorker.close();
    gameHistorySyncWorker = null;
  }

  // Reinitialize
  try {
    await initializeWorker(0);
    return gameHistorySyncWorker !== null;
  } catch (error) {
    console.error(`[GameHistorySyncWorker] Failed to reinitialize worker:`, error);
    return false;
  }
}

export { gameHistorySyncWorker };
export default gameHistorySyncWorker;
