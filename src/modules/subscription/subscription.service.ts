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
            user: { select: { id: true; firstName: true; lastName: true; email: true, phoneNo: true, stripeCustomerId: true, createdAt: true } };
            plan: {
                select: {
                    id: true;
                    name: true;
                    price: true;
                    duration: true;
                    description: true;
                    features: {
                        select: { id: true; name: true; description: true };
                    };
                };
            };
            payment: {
                select: {
                    amount: true;
                    paymentMethod: true
                    stripePaymentId: true;
                    createdAt: true;
                    status: true;
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
            phoneNo: sub.user.phoneNo,
            stripeCustomerId: sub.user.stripeCustomerId,
            createdAt: sub.user.createdAt
        },
        plan: {
            id: sub.plan.id,
            name: sub.plan.name,
            price: sub.plan.price,
            duration: sub.plan.duration,
            description: sub.plan.description,
            features: sub.plan.features,
        },
        payment: sub.payment
            ? {
                status: sub.payment.status,
                amount: sub.payment.amount,
                paymentMethod: sub.payment.paymentMethod,
                stripePaymentId: sub.payment.stripePaymentId,
                createdAt: sub.payment.createdAt
            }
            : null,
        stripeSubscriptionId:  sub.stripeSubscriptionId,
        status: sub.status,
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
    sortBy: string,
    sortOrder: "asc" | "desc"
}

export const buildSubscriptionWhereClause = (
    filters: SubscriptionFilters
): Prisma.UserSubscriptionWhereInput => {
    console.log('filters', filters)
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
            phoneNo: true,
            stripeCustomerId: true,
            createdAt: true
        },
    },
    plan: {
        select: {
            id: true,
            name: true,
            price: true,
            duration: true,
            description: true,
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
            paymentMethod: true,
            stripePaymentId: true,
            createdAt: true,
            status: true
        },
    },
});

const buildOrderBy = (sortBy: string, sortOrder: "asc" | "desc") => {
    if (sortBy.includes(".")) {
        const parts = sortBy.split("."); // e.g., ["user", "email"]
        return { [parts[0]]: { [parts[1]]: sortOrder } };
    }
    return { [sortBy]: sortOrder };
};


/**
 * Get all subscriptions with filters and pagination
 */
export const getAllSubscriptions = async (
    filters: SubscriptionFilters,
    pagination: { page: number; limit: number },
) => {

    console.log('filters ', filters)


    const skip = (pagination.page - 1) * pagination.limit;
    const where = buildSubscriptionWhereClause(filters);

    // const orderBy: Prisma.UserSubscriptionOrderByWithRelationInput = {
    //     [filters.sortBy]: filters.sortOrder,
    // } as Prisma.UserSubscriptionOrderByWithRelationInput;

    const orderBy = buildOrderBy(filters.sortBy, filters.sortOrder);


    console.log('orderBy', orderBy)

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

