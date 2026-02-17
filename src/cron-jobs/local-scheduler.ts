/**
 * =====================================================
 * LOCAL CRON JOB SCHEDULER
 * =====================================================
 * This file uses node-cron to run cron jobs locally during development.
 * It should only be enabled when ENABLE_LOCAL_CRON_JOBS=true
 * 
 * In production (Render), use standalone cron job files instead.
 */

import cron from 'node-cron';
import {
  expireSubscriptions,
  cleanupCanceledSubscriptions,
  processScheduledPlanChanges,
  scheduleGameHistorySync,
} from './jobs';

/**
 * Initialize local cron job schedulers
 * Only runs if ENABLE_LOCAL_CRON_JOBS environment variable is set to 'true'
 */
export function initializeLocalCronJobs(): void {
  const enableLocalCron = process.env.ENABLE_LOCAL_CRON_JOBS === 'true';

  if (!enableLocalCron) {
    console.log('[Local Cron Scheduler] Local cron jobs are disabled. Set ENABLE_LOCAL_CRON_JOBS=true to enable.');
    return;
  }

  console.log('[Local Cron Scheduler] Initializing local cron jobs...');

  // Expire subscriptions - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await expireSubscriptions();
    } catch (error) {
      console.error('[Local Cron Scheduler] Error in expireSubscriptions:', error);
    }
  });
  console.log('[Local Cron Scheduler] Scheduled: Expire subscriptions (every 5 minutes)');

  // Cleanup canceled subscriptions - every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await cleanupCanceledSubscriptions();
    } catch (error) {
      console.error('[Local Cron Scheduler] Error in cleanupCanceledSubscriptions:', error);
    }
  });
  console.log('[Local Cron Scheduler] Scheduled: Cleanup canceled subscriptions (every 30 minutes)');

  // Process scheduled plan changes - every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await processScheduledPlanChanges();
    } catch (error) {
      console.error('[Local Cron Scheduler] Error in processScheduledPlanChanges:', error);
    }
  });
  console.log('[Local Cron Scheduler] Scheduled: Process scheduled plan changes (every 15 minutes)');

  // Game history sync - every 8 hours
  cron.schedule('0 */8 * * *', async () => {
    try {
      await scheduleGameHistorySync();
    } catch (error) {
      console.error('[Local Cron Scheduler] Error in scheduleGameHistorySync:', error);
    }
  });
  console.log('[Local Cron Scheduler] Scheduled: Game history sync (every 8 hours)');

  console.log('[Local Cron Scheduler] All local cron jobs initialized successfully');
}

// Schedule test for logging every minute runnning
export function scheduleTestCronJob(): void {
  cron.schedule('*/1 * * * *', async () => {
    console.log('[Test Cron Job] Running...');
  });
}