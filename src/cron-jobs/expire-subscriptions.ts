/**
 * =====================================================
 * EXPIRE SUBSCRIPTIONS (Standalone Cron Job)
 * =====================================================
 * This script expires ACTIVE / TRIAL / CANCELED subscriptions
 * that have passed their end date and are no longer active in Stripe.
 * 
 * Render Cron Job Command:
 * node dist/cron-jobs/expire-subscriptions.js
 * 
 * Recommended Schedule: /5 (every 5 minutes)
 */

import 'dotenv/config';
import prisma from '../config/prisma';
import { expireSubscriptions } from './jobs';

// Execute the job
expireSubscriptions()
  .then(async () => {
    // Cleanup Prisma connection
    await prisma.$disconnect();
    console.log('[Expire Subscriptions] Prisma connection closed');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Expire Subscriptions] Unhandled error:', error);
    // Cleanup Prisma connection even on error
    await prisma.$disconnect();
    process.exit(1);
  });
