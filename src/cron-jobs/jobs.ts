/**
 * =====================================================
 * SHARED CRON JOB FUNCTIONS
 * =====================================================
 * These functions contain the core logic for each cron job.
 * They can be used both:
 * - Locally via node-cron (development)
 * - As standalone executables (production on Render)
 */

import prisma from '../config/prisma';
import stripe from '../config/stripe';
import { getGameHistorySyncQueue, GameHistorySyncJobData } from '../queue/game-history-sync/index';
import { checkRedisConnection } from '../config/redis';

/**
 * Expire subscriptions that have passed their end date
 */
export async function expireSubscriptions(): Promise<void> {
  console.log('[Expire Subscriptions] Starting job...');
  const startTime = Date.now();

  try {
    const now = new Date();

    // Expire subscriptions that have passed their end date
    const subscriptions = await prisma.userSubscription.findMany({
      where: {
        isDeleted: false,
        status: { in: ['ACTIVE', 'TRIAL', 'CANCELED'] }, // Include CANCELED that haven't expired yet
        endDate: { lte: now }, // Use lte for consistency
      },
    });

    console.log(`[Expire Subscriptions] Found ${subscriptions.length} subscriptions to check`);

    let expiredCount = 0;
    let skippedCount = 0;

    for (const sub of subscriptions) {
      try {
        // If subscription has Stripe ID, verify status with Stripe
        if (sub.stripeSubscriptionId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(
              sub.stripeSubscriptionId
            );

            // If Stripe subscription is still active, don't expire
            if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
              // But if our endDate has passed, we should still expire (Stripe might be out of sync)
              // Only skip if Stripe says active AND endDate hasn't passed significantly
              const daysPastEnd = (now.getTime() - sub.endDate.getTime()) / (1000 * 60 * 60 * 24);
              if (daysPastEnd < 1) {
                skippedCount++;
                continue; // Give 1 day grace period if Stripe says active
              }
            }
          } catch (stripeErr: any) {
            // Stripe subscription deleted / not found - expire it
            if (stripeErr?.statusCode === 404) {
              console.log(`[Expire Subscriptions] Stripe subscription not found for ${sub.id}, expiring`);
            }
          }
        }

        // Update subscription to EXPIRED
        await prisma.userSubscription.update({
          where: { id: sub.id },
          data: {
            status: 'EXPIRED',
            updatedAt: now,
            nextPlanId: null,
            scheduledChangeAt: null,
          },
        });

        expiredCount++;
        console.log(`[Expire Subscriptions] Expired subscription ${sub.id}`);
      } catch (err: any) {
        console.error(`[Expire Subscriptions] Error expiring subscription ${sub.id}:`, err);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Expire Subscriptions] Job completed in ${duration}s. Expired: ${expiredCount}, Skipped: ${skippedCount}`);
  } catch (error) {
    console.error('[Expire Subscriptions] Fatal error:', error);
    throw error;
  }
}

/**
 * Cleanup canceled subscriptions - move CANCELED to EXPIRED after end date
 */
export async function cleanupCanceledSubscriptions(): Promise<void> {
  console.log('[Cleanup Canceled Subscriptions] Starting job...');
  const startTime = Date.now();

  try {
    const result = await prisma.userSubscription.updateMany({
      where: {
        status: 'CANCELED',
        endDate: { lt: new Date() },
        isDeleted: false,
      },
      data: {
        status: 'EXPIRED',
        endDate: new Date(),
        updatedAt: new Date(),
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Cleanup Canceled Subscriptions] Job completed in ${duration}s. Updated ${result.count} subscriptions`);
  } catch (error) {
    console.error('[Cleanup Canceled Subscriptions] Fatal error:', error);
    throw error;
  }
}

/**
 * Process scheduled plan changes
 */
export async function processScheduledPlanChanges(): Promise<void> {
  console.log('[Process Scheduled Plan Changes] Starting job...');
  const startTime = Date.now();

  try {
    const now = new Date();

    const subscriptions = await prisma.userSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
        nextPlanId: { not: null },
        scheduledChangeAt: { lte: now },
        isDeleted: false,
      },
      include: {
        nextPlan: true,
        plan: true,
      },
    });

    console.log(`[Process Scheduled Plan Changes] Found ${subscriptions.length} subscriptions to process`);

    let processedCount = 0;
    let failedCount = 0;

    for (const sub of subscriptions) {
      try {
        const isNextPlanFree = !sub.nextPlan?.stripePriceId;
        const isCurrentPlanFree = !sub.plan.stripePriceId;

        // If changing to free plan, expire current and create new free plan
        if (isNextPlanFree) {
          await prisma.$transaction(async (tx) => {
            // Expire current subscription
            await tx.userSubscription.update({
              where: { id: sub.id },
              data: {
                status: 'EXPIRED',
                endDate: now,
                updatedAt: now,
                nextPlanId: null,
                scheduledChangeAt: null,
              },
            });

            // Create new free plan subscription
            const startDate = new Date();
            let endDate = new Date(startDate);
            if (sub.nextPlan?.trialDays && sub.nextPlan.trialDays > 0) {
              endDate.setDate(endDate.getDate() + sub.nextPlan.trialDays);
            } else if (sub.nextPlan?.duration && sub.nextPlan.duration > 0) {
              endDate.setMonth(endDate.getMonth() + sub.nextPlan.duration);
            } else {
              endDate.setFullYear(endDate.getFullYear() + 100);
            }

            await tx.userSubscription.create({
              data: {
                userId: sub.userId,
                planId: sub.nextPlanId!,
                startDate,
                endDate,
                status: sub.nextPlan?.trialDays && sub.nextPlan.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
              },
            });
          });
          processedCount++;
          console.log(`[Process Scheduled Plan Changes] Processed free plan change for subscription ${sub.id}`);
          continue;
        }

        // For paid plan changes, update Stripe subscription
        if (!sub.stripeSubscriptionId) {
          console.warn(`[Process Scheduled Plan Changes] Missing Stripe subscription ID for subscription ${sub.id}`);
          failedCount++;
          continue;
        }

        if (!sub.nextPlan?.stripePriceId) {
          console.warn(`[Process Scheduled Plan Changes] Missing Stripe price for next plan: ${sub.id}`);
          failedCount++;
          continue;
        }

        // Retrieve the Stripe subscription to get the current subscription item ID
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        
        if (!stripeSub.items?.data?.[0]?.id) {
          console.warn(`[Process Scheduled Plan Changes] No subscription items found for subscription ${sub.id}`);
          failedCount++;
          continue;
        }

        const subscriptionItemId = stripeSub.items.data[0].id;

        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: sub.nextPlan.stripePriceId,
            },
          ],
          proration_behavior: 'none',
        });

        processedCount++;
        console.log(`[Process Scheduled Plan Changes] Triggered Stripe plan change for subscription ${sub.id}`);
      } catch (err) {
        failedCount++;
        console.error(
          `[Process Scheduled Plan Changes] Failed to trigger plan change for subscription ${sub.id}`,
          err
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Process Scheduled Plan Changes] Job completed in ${duration}s. Processed: ${processedCount}, Failed: ${failedCount}`);
  } catch (error) {
    console.error('[Process Scheduled Plan Changes] Fatal error:', error);
    throw error;
  }
}

/**
 * Get API endpoints from environment variables
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
 */
export async function scheduleGameHistorySync(): Promise<void> {
  console.log('[Game History Sync] Starting job...');
  const startTime = Date.now();

  try {
    // Check if Redis is available
    const isRedisAvailable = await checkRedisConnection();
    if (!isRedisAvailable) {
      console.error('[Game History Sync] Redis is not available. Skipping sync.');
      throw new Error('Redis connection unavailable');
    }
    
    const queue = getGameHistorySyncQueue();
    await queue.waitUntilReady();
    
    const endpoints = getApiEndpoints();
    if (endpoints.length === 0) {
      console.warn('[Game History Sync] No API endpoints configured.');
      throw new Error('No API endpoints configured');
    }

    let scheduledCount = 0;
    let failedCount = 0;

    // Schedule jobs for each endpoint
    for (const apiUrl of endpoints) {
      try {
        const jobData: GameHistorySyncJobData = { apiUrl };
        
        // Generate unique job ID to prevent duplicates
        const safeUrl = apiUrl.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        const jobId = `sync-${Date.now()}-${safeUrl}`;

        // Add job to queue (idempotency handled by jobId)
        await queue.add('sync-game-history', jobData, { jobId });
        scheduledCount++;
        console.log(`[Game History Sync] Scheduled job for ${apiUrl}`);
      } catch (error) {
        failedCount++;
        console.error(`[Game History Sync] Failed to schedule job for ${apiUrl}:`, error);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Game History Sync] Job completed in ${duration}s. Scheduled: ${scheduledCount}, Failed: ${failedCount}`);
  } catch (error) {
    console.error('[Game History Sync] Fatal error:', error);
    throw error;
  }
}

// Schedule test for logging every minute runnning
export async function scheduleTestCronJob(): Promise<void> {
  console.log('[Test Cron Job] Starting job...');
  while (true) {
    console.log('[Test Cron Job] Running...');
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}