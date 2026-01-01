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


const calculateGrowth = (current: number, previous: number): number => {
  if (previous === 0) return 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

export const getSubscriptionDashboardStats = async () => {
  const now = new Date();

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  /* =======================
     AGGREGATES
  ======================== */

  const [
    totalRevenue,
    thisMonthRevenue,
    lastMonthRevenue,

    activeSubscriptions,
    totalSubscriptions,
    activeLastMonth
  ] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "SUCCESS", isDeleted: false }
    }),

    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: { gte: startOfThisMonth }
      }
    }),

    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: { gte: startOfLastMonth, lte: startOfThisMonth }
      }
    }),

    prisma.userSubscription.count({
      where: { status: "ACTIVE", isDeleted: false }
    }),

    prisma.userSubscription.count({
      where: { isDeleted: false }
    }),

    prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        isDeleted: false,
        createdAt: { lte: startOfThisMonth }
      }
    })
  ]);

  /* =======================
     CHART DATA
  ======================== */

  // Revenue (last 5 months)
  const revenueChartData = await getMonthlyRevenueChart(5);

  // Active subscriptions trend
  const subscriptionsChartData = await getSubscriptionsTrend(5);

  // Monthly revenue (weekly)
  const monthlyRevenueChartData = await getWeeklyRevenueChart(startOfThisMonth);

  /* =======================
     FINAL RESPONSE
  ======================== */

const [activePlans, totalPlans] = await Promise.all([
  prisma.subscriptionPlan.count({
    where: { isActive: true, isDeleted:false },
  }),
  prisma.subscriptionPlan.count({
    where: {isDeleted: false}
  }),
])


  return {
    stats: {
      totalRevenue: totalRevenue._sum.amount || 0,
      monthlyRevenue: thisMonthRevenue._sum.amount || 0,

      activeSubscriptions,
      totalSubscriptions,
      activePlans,
      totalPlans,

      totalRevenueGrowth: calculateGrowth(
        thisMonthRevenue._sum.amount || 0,
        lastMonthRevenue._sum.amount || 0
      ),

      monthlyRevenueGrowth: calculateGrowth(
        thisMonthRevenue._sum.amount || 0,
        lastMonthRevenue._sum.amount || 0
      ),

      activeSubscriptionsGrowth: calculateGrowth(
        activeSubscriptions,
        activeLastMonth
      )
    },

    charts: {
      revenueChartData,
      subscriptionsChartData,
      monthlyRevenueChartData
    }
  };
};



const getMonthlyRevenueChart = async (months: number) => {
  const now = new Date();
  const data = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        createdAt: { gte: start, lte: end }
      }
    });

    data.push({
      label: start.toLocaleString("default", { month: "short" }),
      value: revenue._sum.amount || 0
    });
  }

  return data;
};

const getSubscriptionsTrend = async (months: number) => {
  const now = new Date();
  const data = [];

  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const count = await prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        createdAt: { lte: end }
      }
    });

    data.push({
      label: end.toLocaleString("default", { month: "short" }),
      value: count
    });
  }

  return data;
};

const getWeeklyRevenueChart = async (monthStart: Date) => {
  const data = [];

  for (let week = 0; week <= 4; week++) {
    const start = new Date(monthStart);
    start.setDate(1 + week * 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        createdAt: { gte: start, lte: end }
      }
    });

    data.push({
      label: `Week ${week + 1}`,
      value: revenue._sum.amount || 0
    });
  }

  return data;
};
