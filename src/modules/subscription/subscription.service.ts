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
      user: { select: { id: true; firstName: true; lastName: true; email: true, phoneNo: true, stripeCustomerId: true, createdAt: true, isTrial: true, state: { select: { id: true, name: true } } } };
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
      state: sub.user.state ? {
          id: sub.user.state.id,
          name: sub.user.state.name,
        } : null,
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
  const now = new Date();
  return prisma.userSubscription.findFirst({
    where: {
      userId,
      isDeleted: false,
      status: { in: ["ACTIVE", "TRIAL"] },
      endDate: { gt: now },
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
  const now = new Date();
  const startDate = new Date();
  let endDate = new Date(startDate);

  if (plan.trialDays && plan.trialDays > 0) {
    endDate.setDate(endDate.getDate() + plan.trialDays);
  } else if (plan.duration && plan.duration > 0) {
    endDate.setMonth(endDate.getMonth() + plan.duration);
  } else {
    // Free forever plan
    endDate.setFullYear(endDate.getFullYear() + 100);
  }

  // Use transaction to ensure atomicity and prevent overlaps
  await prisma.$transaction(async (tx) => {
    // Expire any existing active subscriptions
    const existingActive = await tx.userSubscription.findMany({
      where: {
        userId,
        isDeleted: false,
        status: { in: ["ACTIVE", "TRIAL"] },
        endDate: { gt: now },
      },
    });

    if (existingActive.length > 0) {
      await tx.userSubscription.updateMany({
        where: {
          id: { in: existingActive.map(sub => sub.id) },
        },
        data: {
          status: "EXPIRED",
          endDate: now,
          updatedAt: now,
          nextPlanId: null,
          scheduledChangeAt: null,
        },
      });
    }

    // Create new free/trial subscription
    await tx.userSubscription.create({
      data: {
        userId,
        planId: plan.id,
        startDate,
        endDate,
        status: plan.trialDays && plan.trialDays > 0 ? "TRIAL" : "ACTIVE",
      },
    });

    // Mark user as having used trial if applicable
    if (plan.trialDays && plan.trialDays > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { isTrial: true },
      });
    }
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
      isTrial: true,
      state: {
        select: {
          id: true,
          name: true,
        },
      },
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
      trialDays: true,
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

const calculateGrowth = (current: number, previous: number, normalizeNegative: boolean = false): number => {
  if (previous === 0 && current === 0) return 0;

  if (previous === 0 && current > 0) return 100;

  if (previous > 0 && current === 0) return 0;

  const growth = ((current - previous) / previous) * 100;

  // Safety net
  if (!isFinite(growth)) return 0;

  const roundedGrowth = Math.round(growth);
  
  // Normalize negative growth to 0% for UI clarity
  if (normalizeNegative && roundedGrowth < 0) return 0;

  return roundedGrowth;
};


export const getSubscriptionDashboardStats = async () => {
  const now = new Date();

  // Get current year boundaries (Jan 1 - Dec 31)
  const currentYear = now.getFullYear();
  const currentYearStart = new Date(currentYear, 0, 1, 0, 0, 0, 0); // Jan 1, 00:00:00
  const currentYearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999); // Dec 31, 23:59:59

  // Get previous year boundaries
  const previousYear = currentYear - 1;
  const previousYearStart = new Date(previousYear, 0, 1, 0, 0, 0, 0);
  const previousYearEnd = new Date(previousYear, 11, 31, 23, 59, 59, 999);

  // Get current month boundaries (1st to last day)
  const currentMonthStart = new Date(currentYear, now.getMonth(), 1, 0, 0, 0, 0);
  const currentMonthEnd = new Date(currentYear, now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get previous month boundaries
  const previousMonthStart = new Date(currentYear, now.getMonth() - 1, 1, 0, 0, 0, 0);
  const previousMonthEnd = new Date(currentYear, now.getMonth(), 0, 23, 59, 59, 999);

  const liveMonthStart = getLiveMonthStart(now);
  const previousLiveMonthStart = getLiveMonthStart(liveMonthStart);

  /* =======================
     AGGREGATES
  ======================== */

  const [
    yearlyRevenue,
    previousYearRevenue,
    thisMonthRevenue,
    lastMonthRevenue,
    activeSubscriptions,
    totalSubscriptions,
    inactiveSubscriptions,
    activeLastMonth
  ] = await Promise.all([
    // Yearly revenue (current year)
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: {
          gte: currentYearStart,
          lte: now > currentYearEnd ? currentYearEnd : now
        }
      }
    }),

    // Previous year revenue
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: {
          gte: previousYearStart,
          lte: previousYearEnd
        }
      }
    }),

    // Current month revenue (1st to last day)
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: {
          gte: currentMonthStart,
          lte: now > currentMonthEnd ? currentMonthEnd : now
        }
      }
    }),

    // Previous month revenue
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: {
          gte: previousMonthStart,
          lte: previousMonthEnd
        }
      }
    }),

    // Active subscriptions (overall, not monthly)
    // Definition:
    // - status must be ACTIVE
    // - endDate must be greater than "now" (still running)
    // - user must not be inactive
    // - subscription record must not be deleted
    prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        endDate: { gt: now },
        isDeleted: false,
        user: {
          isInactive: false,
        },
      },
    }),

    // Total subscriptions (for active users only)
    prisma.userSubscription.count({
      where: {
        isDeleted: false,
        user: {
          isInactive: false,
        },
      },
    }),

    // Inactive subscriptions (overall, not monthly)
    // Anything that is not "active" by the above definition:
    // - status is not ACTIVE, or
    // - status is ACTIVE but endDate is in the past
    // Always excludes inactive users and deleted records.
    prisma.userSubscription.count({
      where: {
        isDeleted: false,
        user: {
          isInactive: false,
        },
        OR: [
          {
            status: { not: "ACTIVE" },
          },
          {
            status: "ACTIVE",
            endDate: { lte: now },
          },
        ],
      },
    }),

    // Active subscriptions in the previous live month window
    // Uses the same "active" definition, but evaluated at the previousLiveMonthStart cutoff.
    prisma.userSubscription.count({
      where: {
        status: "ACTIVE",
        endDate: { gt: previousLiveMonthStart },
        isDeleted: false,
        user: {
          isInactive: false,
        },
      },
    })
  ]);

  /* =======================
     CHART DATA
  ======================== */

  // Yearly revenue chart (quarterly: Q1, Q2, Q3, Q4)
  const yearlyRevenueChartData = await getYearlyRevenueChart(currentYear);

  // Active subscriptions proportion chart
  const subscriptionsChartData = getSubscriptionsProportionChart(
    activeSubscriptions,
    inactiveSubscriptions
  );

  // Monthly revenue (4 weeks)
  const monthlyRevenueChartData = await getWeeklyRevenueChart(currentMonthStart, currentMonthEnd);

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
      yearlyRevenue: yearlyRevenue._sum.amount || 0,
      monthlyRevenue: thisMonthRevenue._sum.amount || 0,
      activeSubscriptions,
      totalSubscriptions,
      activePlans,
      totalPlans,

      yearlyRevenueGrowth: calculateGrowth(
        yearlyRevenue._sum.amount || 0,
        previousYearRevenue._sum.amount || 0,
        true // Normalize negative to 0%
      ),

      monthlyRevenueGrowth: calculateGrowth(
        thisMonthRevenue._sum.amount || 0,
        lastMonthRevenue._sum.amount || 0,
        true // Normalize negative to 0%
      ),

      activeSubscriptionsGrowth: calculateGrowth(
        activeSubscriptions,
        activeLastMonth
      )
    },

    charts: {
      yearlyRevenueChartData,
      subscriptionsChartData,
      monthlyRevenueChartData
    }
  };
};



/**
 * Get yearly revenue chart data divided into 4 quarters
 * Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
 */
const getYearlyRevenueChart = async (year: number) => {
  const now = new Date();
  const data = [];

  const quarters = [
    { label: "Jan–Mar", startMonth: 0, endMonth: 2 },   // Q1
    { label: "Apr–Jun", startMonth: 3, endMonth: 5 },   // Q2
    { label: "Jul–Sep", startMonth: 6, endMonth: 8 },   // Q3
    { label: "Oct–Dec", startMonth: 9, endMonth: 11 }   // Q4
  ];

  for (const quarter of quarters) {
    const quarterStart = new Date(year, quarter.startMonth, 1, 0, 0, 0, 0);
    const quarterEnd = new Date(year, quarter.endMonth + 1, 0, 23, 59, 59, 999);
    
    // For current quarter, only count up to now
    const endDate = now < quarterEnd ? now : quarterEnd;

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: {
          gte: quarterStart,
          lte: endDate
        }
      }
    });

    data.push({
      label: quarter.label,
      value: revenue._sum.amount || 0
    });
  }

  return data;
};

/**
 * Get subscriptions proportion chart data (active vs inactive)
 */
const getSubscriptionsProportionChart = (
  activeCount: number,
  inactiveCount: number
) => {
  return [
    {
      label: "Active",
      value: activeCount
    },
    {
      label: "Inactive",
      value: inactiveCount
    }
  ];
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


/**
 * Get monthly revenue chart data divided into exactly 4 weeks
 * Week 1: Days 1-7, Week 2: Days 8-14, Week 3: Days 15-21, Week 4: Days 22-end
 */
const getWeeklyRevenueChart = async (monthStart: Date, monthEnd: Date) => {
  const data = [];
  const now = new Date();
  const actualEnd = now < monthEnd ? now : monthEnd;

  // Calculate days in month
  const daysInMonth = monthEnd.getDate();
  
  // Define week boundaries
  const weekBoundaries = [
    { start: 1, end: 7, label: "Week 1" },
    { start: 8, end: 14, label: "Week 2" },
    { start: 15, end: 21, label: "Week 3" },
    { start: 22, end: daysInMonth, label: "Week 4" }
  ];

  for (const week of weekBoundaries) {
    const weekStart = new Date(monthStart);
    weekStart.setDate(week.start);
    
    const weekEnd = new Date(monthStart);
    weekEnd.setDate(Math.min(week.end, daysInMonth));
    weekEnd.setHours(23, 59, 59, 999);

    // Don't count future weeks
    if (weekStart > actualEnd) {
      data.push({
        label: week.label,
        value: 0
      });
      continue;
    }

    // Adjust end date if it's in the future
    const endDate = weekEnd > actualEnd ? actualEnd : weekEnd;

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "SUCCESS",
        isDeleted: false,
        createdAt: {
          gte: weekStart,
          lte: endDate
        }
      }
    });

    data.push({
      label: week.label,
      value: revenue._sum.amount || 0
    });
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
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId, isDeleted: false },
    });
    if (!plan) throw new Error("Subscription plan not found");
    if (!plan.isActive) throw new Error("Subscription plan is not active");

    if (isFreePlan(plan)) {
      throw new Error("Free/trial plan cannot be purchased via checkout");
    }

    if (!plan.stripePriceId) throw new Error("Stripe price not configured for this plan");

    // Allow checkout if user has free plan (webhook will expire it when paid plan activates)
    // Block checkout only if user has active paid subscription
    if (active && !isFreePlan(active.plan)) {
      throw new Error("An active paid subscription already exists. Please wait for it to expire or cancel at period end.");
    }

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