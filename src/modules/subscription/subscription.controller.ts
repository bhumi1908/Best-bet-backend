import { Request, Response } from "express";
import { sendError, sendSuccess } from "../../utils/helpers";
import { HttpStatus } from "../../utils/constants/enums";
import { SubscriptionStatus } from "../../types/subscription";
import { getAllSubscriptions, getSubscriptionById } from "./subscription.service";

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
                sortOrder : (req.query.sortOrder as "asc" | "desc") || "desc"
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
