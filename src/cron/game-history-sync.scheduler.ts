import cron from 'node-cron';
import { getGameHistorySyncQueue, GameHistorySyncJobData } from '../queue/game-history-sync';
import { checkRedisConnection } from '../config/redis';

/**
 * Get API endpoints from environment variables
 * Supports multiple endpoints separated by commas
 * Format: LOTTERY_API_URLS=https://api1.com,https://api2.com
 * Or single endpoint: LOTTERY_API_URL=https://api.com
 */
function getApiEndpoints(): string[] {
  const endpoints: string[] = [];

  // Check for multiple URLs (comma-separated)
  const multipleUrls = process.env.LOTTERY_API_URLS;
  if (multipleUrls) {
    const urls = multipleUrls.split(',').map((url) => url.trim()).filter(Boolean);
    endpoints.push(...urls);
  }

  // Check for single URL (backward compatibility)
  const singleUrl = process.env.LOTTERY_API_URL;
  if (singleUrl && !multipleUrls) {
    endpoints.push(singleUrl);
  }

  return endpoints;
}

/**
 * Schedule game history sync jobs
 * CRON ONLY SCHEDULES JOBS - NO LOGIC HERE
 */
export async function scheduleGameHistorySync(): Promise<void> {
  try {
    // Check if Redis is available
    const isRedisAvailable = await checkRedisConnection();
    if (!isRedisAvailable) {
      console.error('[GameHistorySyncScheduler] Redis is not available. Skipping sync.');
      return;
    }
    
    const queue = getGameHistorySyncQueue();
    await queue.waitUntilReady();
    
    const endpoints = getApiEndpoints();
    if (endpoints.length === 0) {
      console.warn('[GameHistorySyncScheduler] No API endpoints configured.');
      return;
    }
    // Schedule jobs for each endpoint
    for (const apiUrl of endpoints) {
      try {
        const jobData: GameHistorySyncJobData = { apiUrl };
        
        // Generate unique job ID to prevent duplicates
        const safeUrl = apiUrl.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        const jobId = `sync-${Date.now()}-${safeUrl}`;

        // Add job to queue (idempotency handled by jobId)
        await queue.add('sync-game-history', jobData, { jobId });
      } catch (error) {
        console.error(`[GameHistorySyncScheduler] Failed to schedule job for ${apiUrl}:`, error);
      }
    }
  } catch (error) {
    console.error('[GameHistorySyncScheduler] Error scheduling jobs:', error);
  }
}

/**
 * Initialize game history sync scheduler
 * Production: Every 8 hours
 * Development: Every 30 seconds
 */
export function initializeGameHistorySyncScheduler(): void {
 // Every 8 hours cronSchedule run
  // const cronSchedule =  '0 */8 * * *' 
  // Every 30 seconds cronSchedule run
  const cronSchedule =  '*/30 * * * * *'
  console.log('Cron schedule: Every 30 seconds');
  console.log('Cron schedule:', cronSchedule);
  cron.schedule(cronSchedule, async () => {
    await scheduleGameHistorySync();
  });
}

export default scheduleGameHistorySync;
