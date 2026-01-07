import prisma from "../../config/prisma";
import stripe from "../../config/stripe";
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
      user: { select: { id: true; firstName: true; lastName: true; email: true, phoneNo: true, stripeCustomerId: true, createdAt: true, isTrial: true } };
      plan: {
        select: {
          id: true;
          name: true;
          price: true;
          duration: true;
          description: true;
          isActive: true
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

  return {
    subscriptionId: sub.id,
    user: {
      id: sub.user.id,
      name: `${sub.user.firstName ?? ""} ${sub.user.lastName ?? ""}`.trim(),
      email: sub.user.email,
      phoneNo: sub.user.phoneNo,
      stripeCustomerId: sub.user.stripeCustomerId,
      createdAt: sub.user.createdAt,
      isTrial: sub.user.isTrial,
    },
    plan: {
      id: sub.plan.id,
      name: sub.plan.name,
      price: sub.plan.price ?? 0,
      duration: sub.plan.duration ?? 0,
      description: sub.plan.description,
      features: sub.plan.features,
      isActive: sub.plan.isActive
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
    stripeSubscriptionId: sub.stripeSubscriptionId,
    status: sub.status,
    startDate: sub.startDate.toISOString(),
    endDate: sub.endDate.toISOString(),
    createdAt: sub.createdAt.toISOString(),

  };
};

export const getActiveSubscriptionForUser = async (userId: number) => {
  return prisma.userSubscription.findFirst({
    where: {
      userId,
      isDeleted: false,
      status: { in: ["ACTIVE"] },
      endDate: { gt: new Date() },
    },
    include: getSubscriptionInclude(),
    orderBy: { createdAt: "desc" },
  });
};

export const markExpiredIfPast = async (subscriptionId: number) => {
  const subscription = await prisma.userSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) return null;
  if (subscription.endDate <= new Date() && subscription.status !== "EXPIRED") {
    const updated = await prisma.userSubscription.update({
      where: { id: subscriptionId },
      data: { status: "EXPIRED", updatedAt: new Date() },
      include: getSubscriptionInclude(),
    });
    return formatSubscription(updated);
  }

  return subscription;
};

export const hasUsedFreePlan = (user: { isTrial?: boolean | null }) => Boolean(user?.isTrial);

export const isFreePlan = (plan: { price: number | null; trialDays: number | null; stripePriceId?: string | null }) => {
  return (plan.price ?? 0) === 0 || (plan.trialDays ?? 0) > 0 || !plan.stripePriceId;
};

export const activateFreeOrTrialPlan = async ({
  userId,
  plan,
}: {
  userId: number;
  plan: {
    id: number;
    duration: number | null;
    trialDays: number | null;
    price: number | null;
  };
}) => {
  const startDate = new Date();
  const endDate = new Date(startDate);

  if (plan.trialDays && plan.trialDays > 0) {
    endDate.setDate(endDate.getDate() + plan.trialDays);
  } else if (plan.duration && plan.duration > 0) {
    endDate.setMonth(endDate.getMonth() + plan.duration);
  }

  await prisma.userSubscription.create({
    data: {
      userId,
      planId: plan.id,
      startDate,
      endDate,
      status: "TRIAL",
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { isTrial: true },
  });

  return { startDate, endDate };
};

export const expireDueSubscriptions = async () => {
  const now = new Date();
  await prisma.userSubscription.updateMany({
    where: {
      isDeleted: false,
      status: { in: ["ACTIVE", "TRIAL"] },
      endDate: { lte: now },
    },
    data: { status: "EXPIRED", updatedAt: now },
  });
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

  if (filters.status) {
    switch (filters.status) {
      case "ACTIVE":
        where.stripeSubscriptionId = { not: null };
        where.endDate = { gt: now };
        break;

      case "CANCELED":
        where.stripeSubscriptionId = null;
        break;

      case "EXPIRED":
        where.stripeSubscriptionId = { not: null };
        where.endDate = { lte: now };
        break;

      case "TRIAL":
        where.stripeSubscriptionId = null;
        where.endDate = { gt: now };
        where.plan = {
          trialDays: {
            gt: 0,
          },
        };
        break;

      case "REFUNDED":
        where.payment = {
          refund: {
            isNot: null,
          },
        };
        break;
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
      createdAt: true,
      isTrial: true
    },
  },
  plan: {
    select: {
      id: true,
      name: true,
      price: true,
      duration: true,
      description: true,
      isActive: true,
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

  const skip = (pagination.page - 1) * pagination.limit;
  const where = buildSubscriptionWhereClause(filters);

  // const orderBy: Prisma.UserSubscriptionOrderByWithRelationInput = {
  //     [filters.sortBy]: filters.sortOrder,
  // } as Prisma.UserSubscriptionOrderByWithRelationInput;

  const orderBy = buildOrderBy(filters.sortBy, filters.sortOrder);

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
  if (previous === 0 && current === 0) return 0;

  if (previous === 0 && current > 0) return 100;

  if (previous > 0 && current === 0) return 0;

  const growth = ((current - previous) / previous) * 100;

  // Safety net
  if (!isFinite(growth)) return 0;

  return Math.round(growth);
};


export const getSubscriptionDashboardStats = async () => {
  const now = new Date();

  const liveMonthStart = getLiveMonthStart(now);
  const previousLiveMonthStart = getLiveMonthStart(liveMonthStart);

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
        createdAt: {
          gte: liveMonthStart,
          lte: now
        }
      }
    }),

    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: { gte: previousLiveMonthStart, lte: liveMonthStart }
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
        createdAt: { lte: liveMonthStart }
      }
    })
  ]);
  /* =======================
     CHART DATA
  ======================== */

  // Revenue (last 5 months)
  const revenueChartData = await getMonthlyRevenueChart();

  // Active subscriptions trend
  const subscriptionsChartData = await getSubscriptionsTrend(5);

  // Monthly revenue (weekly)
  const monthlyRevenueChartData = await getWeeklyRevenueChart(liveMonthStart);

  /* =======================
     FINAL RESPONSE
  ======================== */

  const [activePlans, totalPlans] = await Promise.all([
    prisma.subscriptionPlan.count({
      where: { isActive: true, isDeleted: false },
    }),
    prisma.subscriptionPlan.count({
      where: { isDeleted: false }
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



const getMonthlyRevenueChart = async () => {
  const now = new Date();
  const data = [];

  let periodEnd = now;

  for (let block = 0; block < 4; block++) {
    let blockRevenue = 0;
    let blockStart: Date | null = null;
    let blockEnd: Date | null = null;

    for (let m = 0; m < 3; m++) {
      const periodStart = getLiveMonthStart(periodEnd);

      const revenue = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "SUCCESS",
          createdAt: {
            gte: periodStart,
            lt: periodEnd
          }
        }
      });

      blockRevenue += revenue._sum.amount || 0;

      blockStart = periodStart;
      blockEnd ??= periodEnd;

      periodEnd = periodStart;
    }

    data.unshift({
      label: `${blockStart!.toLocaleString("default", { month: "short" })} - ${blockEnd!.toLocaleString("default", { month: "short" })}`,
      value: blockRevenue
    });
  }

  return data;
};
const getSubscriptionsTrend = async (months: number) => {
  const now = new Date();
  const data = [];

  let periodEnd = now;

  for (let i = 0; i < months; i++) {
    const periodStart = getLiveMonthStart(periodEnd);


    const count = await prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        createdAt: { lte: periodEnd }
      }
    });

    data.push({
      label: periodStart.toLocaleString("default", { month: "short" }),
      value: count
    });
    periodEnd = periodStart;

  }

  return data;
};

const getLiveMonthStart = (date: Date) => {
  const start = new Date(date);
  const day = start.getDate();

  start.setMonth(start.getMonth() - 1);

  if (start.getDate() !== day) {
    start.setDate(0);
  }

  return start;
};


const getWeeklyRevenueChart = async (monthStart: Date) => {
  const data = [];
  const now = new Date();

  let weekStart = new Date(monthStart);

  for (let week = 0; week < 5; week++) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    if (weekEnd > now) {
      weekEnd.setTime(now.getTime());
    }

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        createdAt: { gte: weekStart, lte: weekEnd }
      }
    });

    data.push({
      label: `Week ${week + 1}`,
      value: revenue._sum.amount || 0
    });
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 1);

    if (weekStart > now) break;
  }

  return data;
};

// Create stripe checkout session
export const createStripeCheckoutSession = async ({
  planId,
  userEmail,
  userId,
  successUrl,
  cancelUrl,
}: {
  planId: number;
  userEmail: string;
  userId: number;
  successUrl: string;
  cancelUrl: string;
}) => {
  try {
    const active = await getActiveSubscriptionForUser(userId);
    if (active) {
      throw new Error("An active subscription already exists. Please wait for it to expire or cancel at period end.");
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId, isDeleted: false },
    });
    if (!plan) throw new Error("Subscription plan not found");
    if (!plan.isActive) throw new Error("Subscription plan is not active");

    if (isFreePlan(plan)) {
      throw new Error("Free/trial plan cannot be purchased via checkout");
    }

    if (!plan.stripePriceId) throw new Error("Stripe price not configured for this plan");

    // 2. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card", "paypal"],
      customer_email: userEmail,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId.toString(),
        planId: planId.toString(),
      },
      subscription_data: {
        metadata: {
          userId: userId.toString(),
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return session;
  } catch (error) {
    throw error;
  }
};