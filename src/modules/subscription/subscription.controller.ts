import { Request, Response } from "express";
import { sendError, sendSuccess } from "../../utils/helpers";
import { HttpStatus } from "../../utils/constants/enums";
import { SubscriptionStatus } from "../../types/subscription";
import { getAllSubscriptions, getSubscriptionById, getSubscriptionDashboardStats } from "./subscription.service";
import stripe from "../../config/stripe";
import prisma from "../../config/prisma";

export const getAllSubscribedUsersAdmin = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // Parse pagination
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        console.log('req.query.startDateTo', req.query.startDateTo)
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
      include: { plan: true,user:true },
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
    //   trial_period_days: newPlan.duration === 0 ? 14 : undefined,
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
