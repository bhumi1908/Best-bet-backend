import { Request, Response } from "express";
import { sendError, sendSuccess } from "../../utils/helpers";
import { HttpStatus } from "../../utils/constants/enums";
import { SubscriptionStatus } from "../../types/subscription";
import { createStripeCheckoutSession, getAllSubscriptions, getSubscriptionById, getSubscriptionDashboardStats } from "./subscription.service";
import stripe from "../../config/stripe";
import prisma from "../../config/prisma";

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
            include:{
                features:true
            }
        },   
        payment: true 
      },
      orderBy: {
        createdAt: "desc", // Get most recent subscription
      },
    });

    if (!subscription) {
      return sendSuccess(res, null, "No active subscription found", HttpStatus.OK);
    }

    // Format response
    const response = {
      id: subscription.id,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        price: subscription.plan.price,
        duration: subscription.plan.duration,
        trialDays: subscription.plan.trialDays,
        description: subscription.plan.description,
        features: subscription.plan.features.filter(f => !f.isDeleted).map(f => ({
          id: f.id,
          name: f.name,
          description: f.description
        }))
      },
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
            where: { userId: parseInt(userId), status: "ACTIVE" },
            include: { plan: true },
        });

        if (!subscription) return sendError(res, "Active subscription not found", 404);

        if (subscription.stripeSubscriptionId) {
            // Cancel in Stripe immediately
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }

        // Update in DB
        await prisma.userSubscription.update({
            where: { id: subscription.id },
            data: {
                status: "CANCELED",
                updatedAt: new Date(),
            },
        });

        sendSuccess(res, null, "Subscription revoked successfully");
    } catch (error: unknown) {
        sendError(res, error instanceof Error ? error.message : "Failed to revoke subscription", 500);
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

        sendSuccess(res, refund, "Refund processed successfully");
    } catch (error: unknown) {
        sendError(res, error instanceof Error ? error.message : "Failed to process refund", 500);
    }
};

export const changeUserSubscriptionPlan = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { newPlanId } = req.body;

        const userSubscription = await prisma.userSubscription.findFirst({
            where: { userId: parseInt(userId), status: "ACTIVE" },
            include: { plan: true, user: true },
        });
        
        if (!userSubscription) return sendError(res, "Active subscription not found", 404);

        const newPlan = await prisma.subscriptionPlan.findUnique({
            where: { id: newPlanId },
        });

        if (!newPlan || !newPlan.stripePriceId)
            return sendError(res, "Invalid new plan", 400);

        if (!userSubscription.user.stripeCustomerId) {
            return sendError(res, "User does not have a Stripe customer ID", 400);
        }

        if (userSubscription.stripeSubscriptionId) {
            await stripe.subscriptions.update(userSubscription.stripeSubscriptionId, {
                cancel_at_period_end: false,
                proration_behavior: "always_invoice",
            });
        }

        const stripeSubscription = await stripe.subscriptions.create({
            customer: userSubscription.user.stripeCustomerId,
            items: [{ price: newPlan.stripePriceId }],
            expand: ["latest_invoice.payment_intent"],
            payment_behavior: "default_incomplete",
            trial_period_days: newPlan.trialDays ?? undefined
        });

        await prisma.userSubscription.update({
            where: { id: userSubscription.id },
            data: {
                planId: newPlan.id,
                stripeSubscriptionId: stripeSubscription.id,
                status: "ACTIVE",
                updatedAt: new Date(),
            },
        });

        sendSuccess(res, stripeSubscription, "Subscription plan changed successfully");
    } catch (error: unknown) {
        console.error("Error changing subscription plan:", error);
        sendError(
            res,
            error instanceof Error ? error.message : "Failed to change subscription plan",
            500
        );
    }
};
