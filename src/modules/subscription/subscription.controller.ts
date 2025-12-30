import { Request, Response } from "express";
import prisma from "../../config/prisma";
import { sendError, sendSuccess } from "../../utils/helpers";
import { HttpStatus } from "../../utils/constants/enums";
import { Subscription, SubscriptionStatus } from "../../types/subscription";

export const getAllSubscribedUsersAdmin = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const search = req.query.search as string | undefined;
        const status = req.query.status as SubscriptionStatus | undefined;
        const planId = req.query.planId as string | undefined;

        const startDateFrom = req.query.startDateFrom
            ? new Date(req.query.startDateFrom as string)
            : undefined;

        const startDateTo = req.query.startDateTo
            ? new Date(req.query.startDateTo as string)
            : undefined;

        const sortBy = (req.query.sortBy as string) || "createdAt";
        const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";

        //    WHERE CLAUSE
        const where: any = {
            isDeleted: false,
            user: { isInactive: false },
            plan: { isDeleted: false },
        };

        /* Search (user name / email) */
        if (search) {
            where.OR = [
                {
                    user: {
                        email: { contains: search, mode: "insensitive" },
                    },
                },
                {
                    user: {
                        firstName: { contains: search, mode: "insensitive" },
                    },
                },
                {
                    user: {
                        lastName: { contains: search, mode: "insensitive" },
                    },
                },
            ];
        }

        /* Filter by plan */
        if (planId) {
            where.planId = planId;
        }

        /* Filter by start date range */
        if (startDateFrom || startDateTo) {
            where.startDate = {};
            if (startDateFrom) where.startDate.gte = startDateFrom;
            if (startDateTo) where.startDate.lte = startDateTo;
        }
        //    ORDER BY
        const orderBy: any = {};
        orderBy[sortBy] = sortOrder;

        const [subscriptions, total] = await Promise.all([
            prisma.userSubscription.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                    plan: {
                        select: {
                            id: true,
                            name: true,
                            price: true,
                            duration: true,
                            features: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true,
                                },
                            },
                        },
                    },
                    payment: {
                        select: {
                            amount: true,
                            status: true,
                            stripePaymentId: true,
                            createdAt: true,
                        },
                    },
                },
                skip,
                take: limit,
                orderBy,
            }),
            prisma.userSubscription.count({ where }),
        ]);

        if (!subscriptions.length) {
            return sendSuccess(
                res,
                { subscriptions: [] },
                "No subscribed users found",
                HttpStatus.OK
            );
        }

        const formattedSubscriptions: Subscription[] = subscriptions
            .map((sub) => {
                let subscriptionStatus: SubscriptionStatus = "EXPIRED";

                if (!sub.stripeSubscriptionId) {
                    subscriptionStatus = "CANCELED";
                } else if (sub.endDate > new Date()) {
                    subscriptionStatus = "ACTIVE";
                }

                return {
                    subscriptionId: sub.id,
                    user: {
                        id: sub.user.id,
                        name: `${sub.user.firstName ?? ""} ${sub.user.lastName ?? ""}`.trim(),
                        email: sub.user.email,
                    },
                    plan: {
                        id: sub.plan.id,
                        name: sub.plan.name,
                        price: sub.plan.price,
                        duration: sub.plan.duration,
                        features: sub.plan.features,
                    },
                    payment: sub.payment
                        ? {
                            amount: sub.payment.amount,
                            status: sub.payment.status,
                            stripePaymentId: sub.payment.stripePaymentId,
                        }
                        : null,
                    status: subscriptionStatus,
                    startDate: sub.startDate.toISOString(),
                    endDate: sub.endDate.toISOString(),
                    createdAt: sub.createdAt.toISOString(),
                };
            })
            /* Filter by status AFTER calculation */
            .filter((sub) => (status ? sub.status === status : true));


        sendSuccess(
            res,
            {
                subscriptions: formattedSubscriptions,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
            "Subscribed users fetched successfully",
            HttpStatus.OK
        );
    } catch (error: unknown) {
        console.error("Admin get all subscribed users error:", error);

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
) => {
    try {
        const subscriptionId = Number(req.params.userId);

        if (isNaN(subscriptionId)) {
            return sendError(
                res,
                "Invalid subscription ID",
                HttpStatus.BAD_REQUEST
            );
        }

        const subscription = await prisma.userSubscription.findFirst({
            where: {
                id: subscriptionId,
                isDeleted: false,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                plan: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        duration: true,
                        features: {
                            where: { isDeleted: false },
                            select: {
                                id: true,
                                name: true,
                                description: true,
                            },
                        },
                    },
                },
                payment: {
                    select: {
                        amount: true,
                        status: true,
                        stripePaymentId: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!subscription) {
            return sendError(
                res,
                "Subscription not found",
                HttpStatus.NOT_FOUND
            );
        }

        /** 🔹 Compute subscription status */
        let status: "ACTIVE" | "EXPIRED" | "CANCELED" = "EXPIRED";

        if (!subscription.stripeSubscriptionId) {
            status = "CANCELED";
        } else if (subscription.endDate > new Date()) {
            status = "ACTIVE";
        }

        const response: Subscription = {
            subscriptionId: subscription.id,

            user: {
                id: subscription.user.id,
                name: `${subscription.user.firstName ?? ""} ${subscription.user.lastName ?? ""}`.trim(),
                email: subscription.user.email,
            },

            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                price: subscription.plan.price,
                duration: subscription.plan.duration,
                features: subscription.plan.features,
            },

            payment: {
                amount: subscription.payment!.amount,
                status: subscription.payment!.status,
                stripePaymentId: subscription.payment!.stripePaymentId,
            },


            status,
            startDate: subscription.startDate.toISOString(),
            endDate: subscription.endDate.toISOString(),
            createdAt: subscription.createdAt.toISOString(),
        };

        return sendSuccess(
            res,
            { subscription: response },
            "Subscription details fetched successfully",
            HttpStatus.OK
        );
    } catch (error: any) {
        console.error("Admin subscription details error:", error);
        return sendError(
            res,
            error?.message || "Failed to fetch subscription details",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};
