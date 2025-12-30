import prisma from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { Subscription, SubscriptionStatus } from "../../types/subscription";

/**
 * Calculate subscription status based on stripeSubscriptionId and endDate
 */
export const calculateSubscriptionStatus = (
    stripeSubscriptionId: string | null,
    endDate: Date
): SubscriptionStatus => {
    if (!stripeSubscriptionId) {
        return "CANCELED";
    }
    if (endDate > new Date()) {
        return "ACTIVE";
    }
    return "EXPIRED";
};

/**
 * Format subscription data to match Subscription interface
 */
export const formatSubscription = (
    sub: Prisma.UserSubscriptionGetPayload<{
        include: {
            user: { select: { id: true; firstName: true; lastName: true; email: true } };
            plan: {
                select: {
                    id: true;
                    name: true;
                    price: true;
                    duration: true;
                    features: {
                        select: { id: true; name: true; description: true };
                    };
                };
            };
            payment: {
                select: {
                    amount: true;
                    status: true;
                    paymentMethod: true
                    stripePaymentId: true;
                    createdAt: true;
                };
            };
        };
    }>
): Subscription => {
    const status = calculateSubscriptionStatus(sub.stripeSubscriptionId, sub.endDate);

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
                paymentMethod: sub.payment.paymentMethod,
                stripePaymentId: sub.payment.stripePaymentId,
            }
            : null,
        status,
        startDate: sub.startDate.toISOString(),
        endDate: sub.endDate.toISOString(),
        createdAt: sub.createdAt.toISOString(),
    };
};

/**
 * Build WHERE clause for subscription queries
 */
export interface SubscriptionFilters {
    search?: string;
    status?: SubscriptionStatus;
    planId?: number;
    plan?: string;
    startDateFrom?: Date;
    startDateTo?: Date;
}

export const buildSubscriptionWhereClause = (
    filters: SubscriptionFilters
): Prisma.UserSubscriptionWhereInput => {
    const now = new Date();
    const where: Prisma.UserSubscriptionWhereInput = {
        isDeleted: false,
        user: { isInactive: false },
        plan: { isDeleted: false },
    };

    // Search filter (user name / email)
    if (filters.search) {
        where.OR = [
            { user: { email: { contains: filters.search, mode: "insensitive" } } },
            { user: { firstName: { contains: filters.search, mode: "insensitive" } } },
            { user: { lastName: { contains: filters.search, mode: "insensitive" } } },
            { plan: { name: { contains: filters.search, mode: "insensitive" } } },
        ];
    }

    // Filter by plan ID
    if (filters.planId) {
        where.planId = filters.planId;
    }

    // Filter by plan name
    if (filters.plan) {
        where.plan = {
            isDeleted: false,
            name: { equals: filters.plan, mode: "insensitive" },
        };
    }

    // Filter by status at database level
    if (filters.status) {
        if (filters.status === "ACTIVE") {
            // ACTIVE: has stripeSubscriptionId AND endDate > now
            where.stripeSubscriptionId = { not: null };
            where.endDate = { gt: now };
        } else if (filters.status === "CANCELED") {
            // CANCELED: no stripeSubscriptionId
            where.stripeSubscriptionId = null;
        } else if (filters.status === "EXPIRED") {
            // EXPIRED: has stripeSubscriptionId BUT endDate <= now
            where.stripeSubscriptionId = { not: null };
            where.endDate = { lte: now };
        }
    }

    // Filter by start date range
    if (filters.startDateFrom || filters.startDateTo) {
        where.startDate = {};
        if (filters.startDateFrom) {
            where.startDate.gte = filters.startDateFrom;
        }
        if (filters.startDateTo) {
            const endOfDay = new Date(filters.startDateTo);
            endOfDay.setHours(23, 59, 59, 999);
            where.startDate.lte = endOfDay;
        }
    }

    return where;
};

/**
 * Get subscription include clause for queries
 */
export const getSubscriptionInclude = () => ({
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
            paymentMethod: true,
            stripePaymentId: true,
            createdAt: true,
        },
    },
});

/**
 * Get all subscriptions with filters and pagination
 */
export const getAllSubscriptions = async (
    filters: SubscriptionFilters,
    pagination: { page: number; limit: number },
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc"
) => {
    const skip = (pagination.page - 1) * pagination.limit;
    const where = buildSubscriptionWhereClause(filters);

    const orderBy: Prisma.UserSubscriptionOrderByWithRelationInput = {
        [sortBy]: sortOrder,
    } as Prisma.UserSubscriptionOrderByWithRelationInput;

    const [subscriptions, total] = await Promise.all([
        prisma.userSubscription.findMany({
            where,
            include: getSubscriptionInclude(),
            skip,
            take: pagination.limit,
            orderBy,
        }),
        prisma.userSubscription.count({ where }),
    ]);

    return {
        subscriptions: subscriptions.map(formatSubscription),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
    };
};

/**
 * Get subscription by ID
 */
export const getSubscriptionById = async (subscriptionId: number) => {
    const subscription = await prisma.userSubscription.findFirst({
        where: {
            id: subscriptionId,
            isDeleted: false,
        },
        include: getSubscriptionInclude(),
    });

    if (!subscription) {
        return null;
    }

    return formatSubscription(subscription);
};

