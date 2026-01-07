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
cron.schedule("*/1 * * * *", async () => {
    console.log(" Cron: Expire subscriptions");

    const now = new Date();

    const subscriptions = await prisma.userSubscription.findMany({
        where: {
            isDeleted: false,
            status: { in: ["ACTIVE", "TRIAL"] },
            endDate: { lt: now },
            stripeSubscriptionId: { not: null },
        },
    });

    for (const sub of subscriptions) {
        try {
            const stripeSub = await stripe.subscriptions.retrieve(
                sub.stripeSubscriptionId!
            );

            if (stripeSub.status === "active") continue;

            await prisma.userSubscription.update({
                where: { id: sub.id },
                data: {
                    status: "EXPIRED",
                    updatedAt: new Date(),
                },
            });

            console.log(`Expired subscription ${sub.id}`);
        } catch (err: any) {
            // Stripe subscription deleted / not found
            if (err?.statusCode === 404) {
                await prisma.userSubscription.update({
                    where: { id: sub.id },
                    data: {
                        status: "EXPIRED",
                        updatedAt: new Date(),
                    },
                });

                console.log(`Expired missing Stripe subscription ${sub.id}`);
            }
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
    console.log(" Cron: Cleanup canceled subscriptions");

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
    console.log(" Cron: Process scheduled plan changes");

    const now = new Date();

    const subscriptions = await prisma.userSubscription.findMany({
        where: {
            status: "ACTIVE",
            nextPlanId: { not: null },
            scheduledChangeAt: { lte: now },
            stripeSubscriptionId: { not: null },
            isDeleted: false,
        },
        include: {
            nextPlan: true,
        },
    });

    for (const sub of subscriptions) {
        if (!sub.nextPlan?.stripePriceId) {
            console.warn(`Missing Stripe price for next plan: ${sub.id}`);
            continue;
        }

        try {
            await stripe.subscriptions.update(sub.stripeSubscriptionId!, {
                items: [
                    {
                        id: sub.stripeSubscriptionId!,
                        price: sub.nextPlan.stripePriceId,
                    },
                ],
                proration_behavior: "none",
            });

            console.log(`Triggered plan change for subscription ${sub.id}`);
        } catch (err) {
            console.error(
                `Failed to trigger plan change for subscription ${sub.id}`,
                err
            );
        }
    }
});

console.log("Subscription cron jobs initialized");
