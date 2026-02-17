/**
 * =====================================================
 * GAME HISTORY SYNC (Standalone Cron Job)
 * =====================================================
 * This script schedules game history sync jobs to the queue.
 * The actual sync logic is handled by the queue workers.
 * 
 * Render Cron Job Command:
 * node dist/cron-jobs/game-history-sync.js
 * 
 * Recommended Schedule: 0 *\/8 * * * (every 8 hours)
 */

import 'dotenv/config';
import prisma from '../config/prisma';
import { scheduleGameHistorySync } from './jobs';

// Execute the job
scheduleGameHistorySync()
  .then(async () => {
    // Cleanup Prisma connection
    await prisma.$disconnect();
    console.log('[Game History Sync] Prisma connection closed');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Game History Sync] Unhandled error:', error);
    // Cleanup Prisma connection even on error
    await prisma.$disconnect();
    process.exit(1);
  });
