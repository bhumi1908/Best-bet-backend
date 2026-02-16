import cron from "node-cron";
import prisma from "../config/prisma";
import stripe from "../config/stripe";

/**
 * =====================================================
 * EXPIRE SUBSCRIPTIONS (Safety Net)
 * =====================================================
 * Runs every hour
 * - Expires ACTIVE / TRIAL subscriptions
 * - Only if Stripe subscription is no longer active
 */
export function initializeSubscriptionExpireScheduler(): void {
  cron.schedule("*/15 * * * *", async () => {

    const now = new Date();

    // Expire subscriptions that have passed their end date
    const subscriptions = await prisma.userSubscription.findMany({
        where: {
            isDeleted: false,
            status: { in: ["ACTIVE", "TRIAL", "CANCELED"] }, // Include CANCELED that haven't expired yet
            endDate: { lte: now }, // Use lte for consistency
        },
    });

    for (const sub of subscriptions) {
        try {
            // If subscription has Stripe ID, verify status with Stripe
            if (sub.stripeSubscriptionId) {
                try {
                    const stripeSub = await stripe.subscriptions.retrieve(
                        sub.stripeSubscriptionId
                    );

                    // If Stripe subscription is still active, don't expire
                    if (stripeSub.status === "active" || stripeSub.status === "trialing") {
                        // But if our endDate has passed, we should still expire (Stripe might be out of sync)
                        // Only skip if Stripe says active AND endDate hasn't passed significantly
                        const daysPastEnd = (now.getTime() - sub.endDate.getTime()) / (1000 * 60 * 60 * 24);
                        if (daysPastEnd < 1) {
                            continue; // Give 1 day grace period if Stripe says active
                        }
                    }
                } catch (stripeErr: any) {
                    // Stripe subscription deleted / not found - expire it
                    if (stripeErr?.statusCode === 404) {
                        console.log(`Stripe subscription not found for ${sub.id}, expiring`);
                    }
                }
            }

            // Update subscription to EXPIRED
            await prisma.userSubscription.update({
                where: { id: sub.id },
                data: {
                    status: "EXPIRED",
                    updatedAt: now,
                    nextPlanId: null,
                    scheduledChangeAt: null,
                },
            });
        } catch (err: any) {
            console.error(`Error expiring subscription ${sub.id}:`, err);
        }
    }
});

/**
 * =====================================================
 * CLEANUP CANCELED SUBSCRIPTIONS
 * =====================================================
 * Runs every 30 minutes
 * - Moves CANCELED → EXPIRED after period end
 */
cron.schedule("*/30 * * * *", async () => {
    console.log("Scheduler: Cleanup canceled subscriptions");

    await prisma.userSubscription.updateMany({
        where: {
            status: "CANCELED",
            endDate: { lt: new Date() },
            isDeleted: false,
        },
        data: {
            status: "EXPIRED",
            endDate: new Date(),
            updatedAt: new Date(),
        },
    });
});

/**
 * =====================================================
 * PROCESS SCHEDULED PLAN CHANGES
 * =====================================================
 * Runs every 15 minutes
 * - Calls Stripe to switch price
 * - DB updates happen ONLY via webhook
 */
cron.schedule("*/15 * * * *", async () => {
    console.log("Scheduler: Process scheduled plan changes");

    const now = new Date();

    const subscriptions = await prisma.userSubscription.findMany({
        where: {
            status: { in: ["ACTIVE", "TRIAL"] },
            nextPlanId: { not: null },
            scheduledChangeAt: { lte: now },
            isDeleted: false,
        },
        include: {
            nextPlan: true,
            plan: true,
        },
    });

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
                            status: "EXPIRED",
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
                            status: sub.nextPlan?.trialDays && sub.nextPlan.trialDays > 0 ? "TRIAL" : "ACTIVE",
                        },
                    });
                });
                continue;
            }

            // For paid plan changes, update Stripe subscription
            if (!sub.stripeSubscriptionId) {
                console.warn(`Missing Stripe subscription ID for subscription ${sub.id}`);
                continue;
            }

            if (!sub.nextPlan?.stripePriceId) {
                console.warn(`Missing Stripe price for next plan: ${sub.id}`);
                continue;
            }

            // Retrieve the Stripe subscription to get the current subscription item ID
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
            
            if (!stripeSub.items?.data?.[0]?.id) {
                console.warn(`No subscription items found for subscription ${sub.id}`);
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
                proration_behavior: "none",
            });
        } catch (err) {
            console.error(
                `Failed to trigger plan change for subscription ${sub.id}`,
                err
            );
        }
    }
});

console.log("Subscription schedulers initialized");
}
