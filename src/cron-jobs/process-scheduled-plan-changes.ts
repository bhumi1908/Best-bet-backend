/**
 * =====================================================
 * PROCESS SCHEDULED PLAN CHANGES (Standalone Cron Job)
 * =====================================================
 * This script processes scheduled plan changes by calling Stripe
 * to switch subscription prices. DB updates happen ONLY via webhook.
 * 
 * Render Cron Job Command:
 * node dist/cron-jobs/process-scheduled-plan-changes.js
 * 
 * Recommended Schedule: /15  (every 15 minutes)
 */

import 'dotenv/config';
import prisma from '../config/prisma';
import { processScheduledPlanChanges } from './jobs';

// Execute the job
processScheduledPlanChanges()
  .then(async () => {
    // Cleanup Prisma connection
    await prisma.$disconnect();
    console.log('[Process Scheduled Plan Changes] Prisma connection closed');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Process Scheduled Plan Changes] Unhandled error:', error);
    // Cleanup Prisma connection even on error
    await prisma.$disconnect();
    process.exit(1);
  });
