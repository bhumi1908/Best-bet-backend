import { Request, Response } from "express";
import { sendError, sendSuccess } from "../../utils/helpers";
import { HttpStatus } from "../../utils/constants/enums";
import { Subscription, SubscriptionStatus } from "../../types/subscription";
import { activateFreeOrTrialPlan, createStripeCheckoutSession, getActiveSubscriptionForUser, getAllSubscriptions, getSubscriptionById, getSubscriptionDashboardStats, hasUsedFreePlan, isFreePlan } from "./subscription.service";
import stripe from "../../config/stripe";
import prisma from "../../config/prisma";
import { buildSubscriptionResponse } from "../../utils/mapSubscriptions/buildSubscriptions";
import { formatDate } from "date-fns";
/**
 * Create Stripe Checkout Session
 */
export const createCheckoutSession = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { planId } = req.body;

        if (!planId) {
            return sendError(res, "Plan ID is required", HttpStatus.BAD_REQUEST);
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.email) {
            return sendError(res, "User not found", HttpStatus.NOT_FOUND);
        }

        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId, isDeleted: false } });
        if (!plan) {
            return sendError(res, "Plan not found", HttpStatus.NOT_FOUND);
        }
        if (!plan.isActive) {
            return sendError(res, "Plan is inactive", HttpStatus.BAD_REQUEST);
        }
        // Check for existing active subscription
        const activeSubscription = await getActiveSubscriptionForUser(userId!);
        const isRequestedPlanFree = isFreePlan(plan);
        const isRequestedPlanPaid = !isRequestedPlanFree;

        // If user has active subscription and requesting paid plan, allow checkout
        // (the webhook will expire the free plan when paid plan activates)
        if (activeSubscription && isRequestedPlanFree) {
            // User already has active subscription and trying to get free plan
            if (hasUsedFreePlan(user)) {
                return sendError(res, "Free plan already used", HttpStatus.FORBIDDEN);
            }
            // If current subscription is paid, don't allow free plan
            if (!isFreePlan(activeSubscription.plan)) {
                return sendError(
                    res,
                    "You already have an active paid subscription. Please cancel it first or wait for it to expire.",
                    HttpStatus.FORBIDDEN
                );
            }
        }

        // Handle free plan activation (no checkout needed)
        if (isRequestedPlanFree) {
            if (hasUsedFreePlan(user)) {
                return sendError(res, "Free plan already used", HttpStatus.FORBIDDEN);
            }

            // If user has active free plan, expire it first, then activate new free plan
            if (activeSubscription && isFreePlan(activeSubscription.plan)) {
                const now = new Date();
                await prisma.userSubscription.update({
                    where: { id: activeSubscription.id },
                    data: {
                        status: "EXPIRED",
                        endDate: now,
                        updatedAt: now,
                    },
                });
            }

            await activateFreeOrTrialPlan({ userId: user.id, plan });

            return sendSuccess(
                res,
                { trialActivated: true, message: "Free/Trial plan activated successfully" },
                "Free/Trial plan activated",
                HttpStatus.OK
            );
        }

        const session = await createStripeCheckoutSession({
            planId,
            userEmail: user.email,
            userId: user.id,
            successUrl: `${process.env.FRONTEND_URL}/subscription/success`,
            cancelUrl: `${process.env.FRONTEND_URL}/subscription/cancel`,
        });

        return sendSuccess(
            res,
            { url: session.url },
            "Stripe checkout session created successfully",
            HttpStatus.OK
        );
    } catch (error: any) {
        console.error("Stripe checkout error:", error);
        return sendError(res, error.message || "Failed to create checkout session", HttpStatus.INTERNAL_SERVER_ERROR);
    }
};

/**
 * Get current authenticated user's subscription
 */
export const getUserSubscription = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id; // Auth middleware sets this
        if (!userId) return sendError(res, "User not authenticated", HttpStatus.UNAUTHORIZED);

        // Fetch active subscription
        const subscription = await prisma.userSubscription.findFirst({
            where: {
                userId,
                isDeleted: false,
            },
            include: {
                plan: {
                    include: {
                        features: true
                    }
                },
                nextPlan: {
                    include: {
                        features: true
                    }
                },
                payment: true
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        if (!subscription) {
            return sendSuccess(res, null, "No active subscription found", HttpStatus.OK);
        }

        const now = new Date();
        // Check if subscription has expired
        if (subscription.endDate <= now) {
            // Only update if not already EXPIRED, REFUNDED, or REVOKED
            if (subscription.status !== "EXPIRED" && subscription.status !== "REFUNDED") {
                await prisma.userSubscription.update({
                    where: { id: subscription.id },
                    data: {
                        status: "EXPIRED",
                        updatedAt: now,
                        nextPlanId: null,
                        scheduledChangeAt: null
                    },
                });
            }
            return sendSuccess(res, null, "No active subscription found", HttpStatus.OK);
        }

        // Check if subscription is REFUNDED - these should not grant access
        if (subscription.status === "REFUNDED") {
            return sendSuccess(res, null, "No active subscription found", HttpStatus.OK);
        }

        // Check if subscription is CANCELED and has expired
        if (subscription.status === "CANCELED" && subscription.endDate <= now) {
            return sendSuccess(res, null, "No active subscription found", HttpStatus.OK);
        }

        // Format response
        const response = {
            id: subscription.id,
            status: subscription.status,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            nextPlanId: subscription.nextPlanId,
            scheduledChangeAt: subscription.scheduledChangeAt,
            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                price: subscription.plan.price ?? 0,
                duration: subscription.plan.duration ?? 0,
                trialDays: subscription.plan.trialDays ?? 0,
                description: subscription.plan.description,
                features: subscription.plan.features
                    .filter(f => !f.isDeleted)
                    .map(f => ({
                        id: f.id,
                        name: f.name,
                        description: f.description
                    }))
            },
            nextPlan: subscription.nextPlan ? {
                id: subscription.nextPlan.id,
                name: subscription.nextPlan.name,
                price: subscription.nextPlan.price ?? 0,
                duration: subscription.nextPlan.duration ?? 0,
                trialDays: subscription.nextPlan.trialDays ?? 0,
                description: subscription.nextPlan.description,
                features: subscription.nextPlan.features
                    .filter(f => !f.isDeleted)
                    .map(f => ({
                        id: f.id,
                        name: f.name,
                        description: f.description
                    }))
            } : null,
            lastPayment: subscription.payment
                ? {
                    id: subscription.payment.id,
                    amount: subscription.payment.amount ?? 0,
                    status: subscription.payment.status,
                    paymentMethod: subscription.payment.paymentMethod,
                    createdAt: subscription.payment.createdAt
                }
                : null,
        };

        return sendSuccess(res, response, "User subscription fetched successfully", HttpStatus.OK);
    } catch (error: any) {
        console.error("getUserSubscription error:", error);
        return sendError(res, error.message || "Failed to fetch subscription", HttpStatus.INTERNAL_SERVER_ERROR);
    }
};


export const getAllSubscribedUsersAdmin = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // Parse pagination
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        // Parse filters
        const filters = {
            search: req.query.search as string | undefined,
            status: req.query.status as SubscriptionStatus | undefined,
            planId: req.query.planId ? parseInt(req.query.planId as string) : undefined,
            plan: req.query.plan as string | undefined,
            startDateFrom: req.query.startDateFrom
                ? new Date(req.query.startDateFrom as string)
                : undefined,
            startDateTo: req.query.startDateTo
                ? new Date(req.query.startDateTo as string)
                : undefined,
            sortBy: req.query.sortBy as string || "createdAt",
            sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc"
        };

        // Get subscriptions from service
        const result = await getAllSubscriptions(
            filters,
            { page, limit },
        );

        sendSuccess(
            res,
            {
                subscriptions: result.subscriptions,
                pagination: {
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                    totalPages: result.totalPages,
                },
            },
            result.subscriptions.length > 0
                ? "Subscribed users fetched successfully"
                : "No subscribed users found",
            HttpStatus.OK
        );
    } catch (error: unknown) {
        sendError(
            res,
            error instanceof Error
                ? error.message
                : "Failed to fetch subscribed users",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const getSubscriptionDetailsAdmin = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const subscriptionId = Number(req.params.userId);

        if (isNaN(subscriptionId) || subscriptionId <= 0) {
            return sendError(
                res,
                "Invalid subscription ID",
                HttpStatus.BAD_REQUEST
            );
        }

        const subscription = await getSubscriptionById(subscriptionId);

        if (!subscription) {
            return sendError(
                res,
                "Subscription not found",
                HttpStatus.NOT_FOUND
            );
        }

        return sendSuccess(
            res,
            { subscription },
            "Subscription details fetched successfully",
            HttpStatus.OK
        );
    } catch (error: unknown) {
        return sendError(
            res,
            error instanceof Error
                ? error.message
                : "Failed to fetch subscription details",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const getSubscriptionDashboardAdmin = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const result = await getSubscriptionDashboardStats();

        sendSuccess(
            res,
            result,
            "Subscription dashboard data fetched successfully",
            HttpStatus.OK
        );
    } catch (error: unknown) {
        sendError(
            res,
            error instanceof Error
                ? error.message
                : "Failed to fetch dashboard data",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const revokeUserSubscriptionAdmin = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        const subscription = await prisma.userSubscription.findFirst({
            where: { userId: parseInt(userId), status: { in: ["ACTIVE", "TRIAL"], } },
            include: { plan: true, payment: true, },
            orderBy: { createdAt: "desc" },

        });

        if (!subscription) return sendError(res, "Active subscription not found", 404);

        if (subscription.status === "TRIAL" && subscription.payment) {
            await prisma.payment.delete({
                where: { id: subscription.payment.id },
            });
        }

        if (subscription.status === "ACTIVE" && subscription.stripeSubscriptionId) {
            // Cancel in Stripe immediately
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }

        // Update in DB - Admin revoke immediately ends access
        const now = new Date();
        await prisma.userSubscription.update({
            where: { id: subscription.id },
            data: {
                status: "CANCELED",
                endDate: now, // Immediate revocation
                updatedAt: now,
                nextPlanId: null,
                scheduledChangeAt: null,
            },
        });

        // Refresh subscription details for immediate UI update
        const updatedSubscription = await getSubscriptionById(subscription.id);

        sendSuccess(res, updatedSubscription, "Subscription revoked successfully");
    } catch (error: unknown) {
        sendError(res, error instanceof Error ? error.message : "Failed to revoke subscription", 500);
    }
};

export const changeUserSubscriptionPlan = async (req: Request, res: Response) => {
    try {

        const { userId } = req.params;
        const { newPlanId } = req.body;

        const userSubscription = await prisma.userSubscription.findFirst({
            where: { userId: parseInt(userId), status: { in: ["ACTIVE", "TRIAL"] }, },
            include: { plan: true, user: true },
        });

        if (!userSubscription) return sendError(res, "Active subscription not found", 404);

        const newPlan = await prisma.subscriptionPlan.findUnique({
            where: { id: newPlanId },
            include: {
                features: true,
            },
        });

        if (!newPlan || newPlan.isDeleted)
            return sendError(res, "Invalid new plan", 400);

        if (!newPlan.isActive) {
            return sendError(res, "Plan is inactive", 400);
        }

        const hadStripeSubscription = !!userSubscription.stripeSubscriptionId;

        // Only require Stripe customer ID for paid plan changes that involve Stripe subscriptions
        // Admin can grant paid plans without Stripe (no payment required)
        // But if changing PAID → PAID, we need Stripe customer ID to update the subscription
        if (hadStripeSubscription && !isFreePlan(newPlan) && !userSubscription.user.stripeCustomerId) {
            return sendError(res, "User does not have a Stripe customer ID", 400);
        }

        if (isFreePlan(newPlan) && hasUsedFreePlan(userSubscription.user)) {
            return sendError(res, "Free plan already used", 403);
        }

        const now = new Date();
        const isNewPlanFree = isFreePlan(newPlan);
        const isCurrentPlanFree = isFreePlan(userSubscription.plan);


        // ADMIN PLAN CHANGE: Expire old plan immediately, activate new plan immediately
        // Use transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx) => {
            // Step 1: Handle Stripe subscription if exists
            if (hadStripeSubscription && userSubscription.stripeSubscriptionId) {
                if (isNewPlanFree) {
                    // PAID → FREE: Cancel Stripe subscription and expire current
                    await stripe.subscriptions.cancel(
                        userSubscription.stripeSubscriptionId,
                        {
                            invoice_now: false,
                            prorate: false,
                        }
                    );

                    // Expire current and create new free plan
                    await tx.userSubscription.update({
                        where: { id: userSubscription.id },
                        data: {
                            status: "EXPIRED",
                            endDate: now,
                            updatedAt: now,
                            nextPlanId: null,
                            scheduledChangeAt: null,
                        },
                    });

                    const startDate = new Date();
                    let endDate = new Date(startDate);
                    if (newPlan.trialDays && newPlan.trialDays > 0) {
                        endDate.setDate(endDate.getDate() + newPlan.trialDays);
                    } else if (newPlan.duration && newPlan.duration > 0) {
                        endDate.setMonth(endDate.getMonth() + newPlan.duration);
                    } else {
                        endDate.setFullYear(endDate.getFullYear() + 100);
                    }

                    const newSubscription = await tx.userSubscription.create({
                        data: {
                            userId: userSubscription.userId,
                            planId: newPlan.id,
                            startDate,
                            endDate,
                            stripeSubscriptionId: null,
                            status: newPlan.trialDays && newPlan.trialDays > 0 ? "TRIAL" : "ACTIVE",
                        },
                        include: {
                            user: true,
                            plan: { include: { features: true } },
                            payment: true,
                        },
                    });

                    if (newPlan.trialDays && newPlan.trialDays > 0) {
                        await tx.user.update({
                            where: { id: userSubscription.userId },
                            data: { isTrial: true },
                        });
                    }

                    return newSubscription;
                } else {
                    // PAID → PAID: Update existing subscription (same Stripe subscription)
                    if (!newPlan.stripePriceId) {
                        throw new Error("Invalid paid plan - missing Stripe price ID");
                    }

                    const stripeSub = await stripe.subscriptions.retrieve(
                        userSubscription.stripeSubscriptionId
                    );

                    await stripe.subscriptions.update(stripeSub.id, {
                        cancel_at_period_end: false,
                        proration_behavior: "always_invoice",
                        items: [
                            {
                                id: stripeSub.items.data[0].id,
                                price: newPlan.stripePriceId,
                            },
                        ],
                    });

                    // Update existing subscription to new plan immediately
                    const updatedSubscription = await tx.userSubscription.update({
                        where: { id: userSubscription.id },
                        data: {
                            planId: newPlan.id,
                            status: "ACTIVE",
                            updatedAt: now,
                            nextPlanId: null,
                            scheduledChangeAt: null,
                        },
                        include: {
                            user: true,
                            plan: { include: { features: true } },
                            payment: true,
                        },
                    });

                    return updatedSubscription;
                }
            } else {
                // FREE → FREE or FREE → PAID (no Stripe subscription)
                // Expire current and create new
                await tx.userSubscription.update({
                    where: { id: userSubscription.id },
                    data: {
                        status: "EXPIRED",
                        endDate: now,
                        updatedAt: now,
                        nextPlanId: null,
                        scheduledChangeAt: null,
                    },
                });

                const startDate = new Date();
                let endDate = new Date(startDate);

                if (isNewPlanFree) {
                    if (newPlan.trialDays && newPlan.trialDays > 0) {
                        endDate.setDate(endDate.getDate() + newPlan.trialDays);
                    } else if (newPlan.duration && newPlan.duration > 0) {
                        endDate.setMonth(endDate.getMonth() + newPlan.duration);
                    } else {
                        endDate.setFullYear(endDate.getFullYear() + 100);
                    }
                } else {
                    // FREE → PAID: Admin can grant paid plan without payment
                    // Create subscription with stripeSubscriptionId: null (no Stripe billing)
                    if (newPlan.duration && newPlan.duration > 0) {
                        endDate.setMonth(endDate.getMonth() + newPlan.duration);
                    } else {
                        endDate.setMonth(endDate.getMonth() + 1); // Default 1 month
                    }
                }

                const newSubscription = await tx.userSubscription.create({
                    data: {
                        userId: userSubscription.userId,
                        planId: newPlan.id,
                        startDate,
                        endDate,
                        stripeSubscriptionId: isNewPlanFree ? null : null, // No Stripe subscription for admin-granted plans (free or paid)
                        status: isNewPlanFree
                            ? (newPlan.trialDays && newPlan.trialDays > 0 ? "TRIAL" : "ACTIVE")
                            : "ACTIVE", // Admin-granted paid plan is immediately ACTIVE
                    },
                    include: {
                        user: true,
                        plan: { include: { features: true } },
                        payment: true,
                    },
                });

                if (isNewPlanFree && newPlan.trialDays && newPlan.trialDays > 0) {
                    await tx.user.update({
                        where: { id: userSubscription.userId },
                        data: { isTrial: true },
                    });
                }

                return newSubscription;
            }
        });

        const formattedSubscription = await getSubscriptionById(result.id);
        return sendSuccess(
            res,
            formattedSubscription,
            "Subscription plan changed successfully"
        );
    } catch (error: unknown) {
        console.error("Error changing subscription plan:", error);
        sendError(
            res,
            error instanceof Error ? error.message : "Failed to change subscription plan",
            500
        );
    }
};

export const refundSubscriptionPaymentAdmin = async (req: Request, res: Response) => {
    try {
        const { paymentIntentId } = req.params;
        const { amount, reason } = req.body;

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!paymentIntent) return sendError(res, "Payment not found", 404);

        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: Math.round(Number(amount) * 100),
            reason: reason || "requested_by_customer",
        });

        const payment = await prisma.payment.findUnique({
            where: { stripePaymentId: paymentIntentId },
            include: { subscription: true },
        });

        if (!payment) return sendError(res, "Payment not found in database", 404);

        const refundRecord = await prisma.refund.create({
            data: {
                paymentId: payment.id,
                userId: payment.userId,
                amount: Number(amount),
                status: "SUCCESS",
                stripeRefundId: refund.id,
            },
        });

        // Update subscription status to REFUNDED and immediately revoke access
        let updatedSubscription: Subscription | null = null;
        if (payment.subscription && payment.subscription.length > 0) {
            const now = new Date();
            for (const sub of payment.subscription) {
                await prisma.userSubscription.update({
                    where: { id: sub.id },
                    data: {
                        status: "REFUNDED",
                        endDate: now, // Immediate access revocation
                        updatedAt: now,
                        nextPlanId: null,
                        scheduledChangeAt: null,
                    },
                });
            }
            // Get updated subscription for response
            updatedSubscription = await getSubscriptionById(payment.subscription[0].id);
        }

        // Return refund data with subscription info for immediate UI update
        const refundResponse = {
            ...refundRecord,
            userId: payment.userId,
            subscription: updatedSubscription,
        };

        return sendSuccess(res, refundResponse, "Refund processed successfully");
    } catch (error: unknown) {
        sendError(res, error instanceof Error ? error.message : "Failed to process refund", 500);
    }
};


export const revokeUserSubscriptionSelf = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;

        const subscription = await prisma.userSubscription.findFirst({
            where: { userId, status: { in: ["ACTIVE", "TRIAL"] }, isDeleted: false },
            orderBy: { createdAt: "desc" },
        });

        if (!subscription) {
            return sendError(res, "Subscription not found", 404);
        }
        if (subscription.status === "TRIAL") {
            // delete payment if exists
            if (subscription.paymentId) {
                await prisma.payment.delete({
                    where: { id: subscription.paymentId },
                });
            }

            const canceledTrial = await prisma.userSubscription.update({
                where: { id: subscription.id },
                data: {
                    status: "CANCELED",
                    updatedAt: new Date(),
                    nextPlanId: null,
                    scheduledChangeAt: null,
                },
                include: {
                    plan: { include: { features: true } },
                },
            });
            return sendSuccess(res, canceledTrial, "Trial subscription canceled successfully");
        }
        if (!subscription?.stripeSubscriptionId) return sendError(res, "Active subscription not found", 404);

        const stripeSub = await stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId
        );

        if (stripeSub.status === "canceled") {
            await prisma.userSubscription.update({
                where: { id: subscription.id },
                data: { status: "CANCELED" },
            });

            return sendSuccess(res, null, "Subscription already canceled");
        }

        if (stripeSub.cancel_at_period_end) {
            await prisma.userSubscription.update({
                where: { id: subscription.id },
                data: { status: "CANCELED" },
            });

            return sendSuccess(res, null, "Subscription already scheduled to cancel");
        }
        // If ACTIVE with Stripe, cancel at period end
        if (stripeSub.status === "active" && !stripeSub.cancel_at_period_end) {
            await stripe.subscriptions.update(stripeSub.id, {
                cancel_at_period_end: true,
            });
        }

        // Update subscription in DB - User self-cancel keeps access until period end
        const now = new Date();
        const updateSubscriptions = await prisma.userSubscription.update({
            where: { id: subscription.id },
            data: {
                status: "CANCELED",
                updatedAt: now,
                nextPlanId: null,
                scheduledChangeAt: null,
                // Keep endDate unchanged - user keeps access until period end
            },
            include: {
                plan: {
                    include: { features: true }
                },
                nextPlan: {
                    include: { features: true }
                },
                payment: true
            }
        });

        return sendSuccess(res, updateSubscriptions, "Subscription canceled at period end");
    } catch (error: unknown) {
        console.error(error);
        sendError(res, error instanceof Error ? error.message : "Failed to cancel subscription", 500);
    }
};


export const changeUserSubscriptionPlanSelf = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { newPlanId } = req.body;

        if (!userId) return sendError(res, "User not authenticated", HttpStatus.UNAUTHORIZED);
        if (!newPlanId) return sendError(res, "newPlanId is required", HttpStatus.BAD_REQUEST);

        // Get user with all subscriptions to check if they've used a free trial
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                subscriptions: {
                    where: { isDeleted: false }
                }
            }
        });

        if (!user) {
            return sendError(res, "User not found", HttpStatus.NOT_FOUND);
        }
        // Get the new plan first
        const newPlan = await prisma.subscriptionPlan.findUnique({
            where: { id: newPlanId, isDeleted: false }
        });

        if (!newPlan) {
            return sendError(res, "Plan not found", HttpStatus.NOT_FOUND);
        }

        const isFreePlans = isFreePlan(newPlan);

        if (isFreePlans) {
            // Check if user has already used a free/trial plan
            const userSubscriptions = await prisma.userSubscription.findMany({
                where: {
                    userId,
                    isDeleted: false,
                    OR: [
                        { status: 'TRIAL' },
                        {
                            plan: {
                                OR: [
                                    { trialDays: { gt: 0 } },
                                    { price: 0 }
                                ]
                            }
                        }
                    ]
                },
                include: {
                    plan: true
                }
            });

            // Check if user has any active or completed free/trial subscription
            const hasUsedFreePlan = userSubscriptions.some(sub => {
                // If subscription is TRIAL status
                if (sub.status === 'TRIAL') return true;

                // If the plan itself is free/trial
                if ((newPlan?.trialDays ?? 0) > 0 || sub.plan?.price === 0) return true;

                return false;
            });

            if (hasUsedFreePlan) {
                return sendError(res, "You have already used a free plan or trial. Please choose a paid plan.", HttpStatus.BAD_REQUEST);
            }
        }

        // Get current active subscription
        const currentSubscription = await prisma.userSubscription.findFirst({
            where: {
                userId,
                isDeleted: false,
                status: { in: ["ACTIVE", "TRIAL"] }
            },
            include: {
                plan: true,
                nextPlan: true
            }
        });

        const isCurrentPlanFree = currentSubscription ? isFreePlan(currentSubscription.plan) : false;

        // If user is on FREE plan and trying to switch to PAID plan, they must use checkout
        if (currentSubscription && isCurrentPlanFree && !isFreePlan) {
            return sendError(
                res,
                "To upgrade from a free plan to a paid plan, please use the checkout process. Your free plan will be automatically replaced when payment is successful.",
                HttpStatus.BAD_REQUEST
            );
        }

        if (!currentSubscription) {
            // If no active subscription, user is subscribing for the first time
            // For free plans, create subscription immediately
            if (isFreePlans) {
                const startDate = new Date();
                let endDate = new Date(startDate);

                if ((newPlan?.trialDays ?? 0) > 0) {
                    endDate.setDate(endDate.getDate() + (newPlan?.trialDays ?? 0));
                } else if ((newPlan?.duration ?? 0) > 0) {
                    endDate.setMonth(endDate.getMonth() + (newPlan?.duration ?? 0));
                } else {
                    // Free forever plan
                    endDate.setFullYear(endDate.getFullYear() + 100); // Far future
                }

                const newSubscription = await prisma.userSubscription.create({
                    data: {
                        userId,
                        planId: newPlanId,
                        startDate,
                        endDate,
                        status: (newPlan?.trialDays ?? 0) > 0 ? 'TRIAL' : 'ACTIVE',
                    },
                    include: {
                        plan: {
                            include: { features: true }
                        },
                        payment: true
                    }
                });

                return sendSuccess(res, newSubscription, "Free plan activated successfully", HttpStatus.OK);
            }

            // For paid plans without active subscription, redirect to checkout
            return sendError(res, "No active subscription found. Please use checkout for new subscriptions.", HttpStatus.BAD_REQUEST);
        }

        // Check if trying to change to same plan
        if (currentSubscription.planId === newPlanId) {
            // User wants to cancel scheduled change
            const updatedSubscription = await prisma.userSubscription.update({
                where: { id: currentSubscription.id },
                data: {
                    nextPlanId: null,
                    scheduledChangeAt: null,
                    updatedAt: new Date()
                },
                include: {
                    plan: {
                        include: { features: true }
                    },
                    nextPlan: {
                        include: { features: true }
                    },
                    payment: true
                }
            });

            return sendSuccess(res, updatedSubscription, "Scheduled change cancelled", HttpStatus.OK);
        }

        // Check if user already has a scheduled change to this plan
        if (currentSubscription.nextPlanId === newPlanId) {
            return sendError(res, "You already have a scheduled change to this plan", HttpStatus.BAD_REQUEST);
        }

        // User self plan change: Only allow scheduling for PAID → PAID or PAID → FREE
        // FREE → PAID must go through checkout (already handled above)

        // If current plan is paid and new plan is also paid, schedule the change
        // If current plan is paid and new plan is free, schedule the change
        // Both will happen at period end to maintain access continuity

        const updatedSubscription = await prisma.userSubscription.update({
            where: { id: currentSubscription.id },
            data: {
                nextPlanId: newPlanId,
                scheduledChangeAt: currentSubscription.endDate,
                updatedAt: new Date()
            },
            include: {
                plan: {
                    include: { features: true }
                },
                nextPlan: {
                    include: { features: true }
                },
                payment: true
            }
        });

        return sendSuccess(res, updatedSubscription,
            `Plan change scheduled successfully. Your current plan will continue until ${formatDate(currentSubscription.endDate, 'MMM dd, yyyy')}.`,
            HttpStatus.OK
        );

    } catch (error: any) {
        console.error("changeUserSubscriptionPlanSelf error:", error);
        return sendError(res, error.message || "Failed to change subscription plan", HttpStatus.INTERNAL_SERVER_ERROR);
    }
};

// subscription.controller.ts - Add cancel scheduled change endpoint
export const cancelScheduledPlanChange = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return sendError(res, "User not authenticated", HttpStatus.UNAUTHORIZED);

        // Get current active subscription
        const subscription = await prisma.userSubscription.findFirst({
            where: {
                userId,
                isDeleted: false,
                status: { in: ['ACTIVE', 'TRIAL'] }
            }
        });

        if (!subscription) {
            return sendError(res, "No active subscription found", HttpStatus.BAD_REQUEST);
        }

        // Check if there's a scheduled change
        if (!subscription.nextPlanId || !subscription.scheduledChangeAt) {
            return sendSuccess(res, null, "No scheduled plan change to cancel", HttpStatus.OK);
        }

        // Update subscription to remove scheduled change
        const updatedSubscription = await prisma.userSubscription.update({
            where: { id: subscription.id },
            data: {
                nextPlanId: null,
                scheduledChangeAt: null,
                updatedAt: new Date()
            },
            include: {
                plan: {
                    include: { features: true }
                },
                nextPlan: {
                    include: { features: true }
                },
                payment: true
            }
        });

        return sendSuccess(res, updatedSubscription, "Scheduled plan change cancelled successfully", HttpStatus.OK);
    } catch (error: any) {
        console.error("cancelScheduledPlanChange error:", error);
        return sendError(res, error.message || "Failed to cancel scheduled change", HttpStatus.INTERNAL_SERVER_ERROR);
    }
};
