/**
 * =====================================================
 * CLEANUP CANCELED SUBSCRIPTIONS (Standalone Cron Job)
 * =====================================================
 * This script moves CANCELED subscriptions to EXPIRED status
 * after their end date has passed.
 * 
 * Render Cron Job Command:
 * node dist/cron-jobs/cleanup-canceled-subscriptions.js
 * 
 * Recommended Schedule: /30(every 30 minutes)
 */

import 'dotenv/config';
import prisma from '../config/prisma';
import { cleanupCanceledSubscriptions } from './jobs';

// Execute the job
cleanupCanceledSubscriptions()
  .then(async () => {
    // Cleanup Prisma connection
    await prisma.$disconnect();
    console.log('[Cleanup Canceled Subscriptions] Prisma connection closed');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Cleanup Canceled Subscriptions] Unhandled error:', error);
    // Cleanup Prisma connection even on error
    await prisma.$disconnect();
    process.exit(1);
  });
