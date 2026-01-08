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
        const activeSubscription = await getActiveSubscriptionForUser(userId!);
        if (activeSubscription && !hasUsedFreePlan(user)) {
            return sendError(
                res,
                "You already have an active subscription. Please wait for it to expire or contact support.",
                HttpStatus.FORBIDDEN
            );
        }

        if (isFreePlan(plan)) {
            if (hasUsedFreePlan(user)) {
                return sendError(res, "Free plan already used", HttpStatus.FORBIDDEN);
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

        if (subscription.endDate <= new Date() && subscription.status !== "EXPIRED") {
            await prisma.userSubscription.update({
                where: { id: subscription.id },
                data: {
                    status: "EXPIRED",
                    updatedAt: new Date(),
                    nextPlanId: null,
                    scheduledChangeAt: null
                },
            });
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
                price: subscription.plan.price,
                duration: subscription.plan.duration,
                trialDays: subscription.plan.trialDays,
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
                price: subscription.nextPlan.price,
                duration: subscription.nextPlan.duration,
                trialDays: subscription.nextPlan.trialDays,
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
                    amount: subscription.payment.amount,
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

        // Update in DB
        await prisma.userSubscription.update({
            where: { id: subscription.id },
            data: {
                status: "CANCELED",
                endDate: new Date(),
                updatedAt: new Date(),
            },
        });

        sendSuccess(res, null, "Subscription revoked successfully");
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

        if (!userSubscription.user.stripeCustomerId) {
            return sendError(res, "User does not have a Stripe customer ID", 400);
        }

        if (isFreePlan(newPlan) && hasUsedFreePlan(userSubscription.user)) {
            return sendError(res, "Free plan already used", 403);
        }

        const now = new Date();
        const hasRunningPaid = userSubscription.stripeSubscriptionId && userSubscription.endDate > now;
        if (hasRunningPaid && !isFreePlan(userSubscription.plan)) {
            return sendError(res, "Plan change will start after current period. Please retry after expiry or cancel at period end.", 400);
        }

        if (userSubscription.stripeSubscriptionId) {
            await stripe.subscriptions.update(userSubscription.stripeSubscriptionId, {
                cancel_at_period_end: false,
                proration_behavior: "always_invoice",
            });
        }

        const isNewPlanFree = isFreePlan(newPlan);
        const hadStripeSubscription = !!userSubscription.stripeSubscriptionId;

        // ADMIN: PAID → FREE
        if (hadStripeSubscription && isNewPlanFree) {
            await stripe.subscriptions.cancel(
                userSubscription.stripeSubscriptionId!,
                {
                    invoice_now: false,
                    prorate: false,
                }
            );

            const updatedSubscription = await prisma.userSubscription.update({
                where: { id: userSubscription.id },
                data: {
                    planId: newPlan.id,
                    stripeSubscriptionId: null,
                    status: "TRIAL",
                    updatedAt: new Date(),
                },
                include: {
                    user: true,
                    plan: { include: { features: true } },
                    payment: true,
                },
            });

            return sendSuccess(
                res,
                buildSubscriptionResponse(updatedSubscription),
                "User moved to FREE plan successfully"
            );
        }

        //  * ADMIN: PAID → PAID
        if (hadStripeSubscription && !isNewPlanFree) {
            if (!newPlan.stripePriceId) {
                return sendError(res, "Invalid paid plan", 400);
            }

            const stripeSub = await stripe.subscriptions.retrieve(
                userSubscription.stripeSubscriptionId!
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

            const updatedSubscription = await prisma.userSubscription.update({
                where: { id: userSubscription.id },
                data: {
                    planId: newPlan.id,
                    updatedAt: new Date(),
                },
                include: {
                    user: true,
                    plan: { include: { features: true } },
                    payment: true,
                },
            });

            return sendSuccess(
                res,
                buildSubscriptionResponse(updatedSubscription),
                "Subscription plan changed successfully"
            );
        }

        //  * ADMIN: FREE → FREE
        const stripeSubscription = await stripe.subscriptions.create({
            customer: userSubscription.user.stripeCustomerId!,
            items: [{ price: newPlan.stripePriceId! }],
            payment_behavior: "default_incomplete",
            expand: ["latest_invoice.payment_intent"],
            trial_period_days: newPlan.trialDays ?? undefined,
        });


        const updatedSubscription = await prisma.userSubscription.update({
            where: { id: userSubscription.id },
            data: {
                planId: newPlan.id,
                stripeSubscriptionId: stripeSubscription.id,
                updatedAt: new Date(),
                status: "ACTIVE",
            },
            include: {
                user: true,
                plan: { include: { features: true } },
                payment: true,
            },
        });

        sendSuccess(res, buildSubscriptionResponse(updatedSubscription), "Subscription plan changed successfully");
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

        if (payment.subscription && payment.subscription.length > 0) {
            for (const sub of payment.subscription) {
                await prisma.userSubscription.update({
                    where: { id: sub.id },
                    data: { status: "REFUNDED" },
                });
            }
        }

        sendSuccess(res, refundRecord, "Refund processed successfully");
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


        // If user has a trial with payment, delete the payment
        if (subscription.status === "TRIAL" && subscription.paymentId) {
            await prisma.payment.delete({ where: { id: subscription.paymentId } });
        }

        // If ACTIVE with Stripe, cancel at period end
        if (stripeSub.status === "active" && !stripeSub.cancel_at_period_end) {
            await stripe.subscriptions.update(stripeSub.id, {
                cancel_at_period_end: true,
            });
        }

        // Update subscription in DB
        const updateSubscriptions = await prisma.userSubscription.update({
            where: { id: subscription.id },
            data: {
                status: "CANCELED",
                updatedAt: new Date(),
                nextPlanId: null,
                scheduledChangeAt: null,
            },
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

        const isFreePlan =
            (newPlan?.trialDays ?? 0) > 0 || newPlan.price === 0;

        if (isFreePlan) {
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

        if (!currentSubscription) {
            // If no active subscription, user is subscribing for the first time
            // For free plans, create subscription immediately
            if (isFreePlan) {
                const startDate = new Date();
                let endDate = new Date(startDate);

                if ((newPlan?.trialDays ?? 0) > 0) {
                    endDate.setDate(endDate.getDate() + (newPlan?.trialDays ?? 0));
                } else if ((newPlan?.trialDays ?? 0) > 0) {
                    endDate.setMonth(endDate.getMonth() + (newPlan?.trialDays ?? 0));
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

        // Schedule the plan change for end of current period
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
