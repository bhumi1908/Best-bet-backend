import { SubscriptionStatus, UserSubscription } from "../../generated/prisma/client";

export const buildSubscriptionResponse = (
  subscription: UserSubscription & {
    user: any;
    plan: any;
    payment?: any | null;
  }
) => {
  return {
    subscriptionId: subscription.id,
    stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,

    user: {
      id: subscription.user.id,
      name: `${subscription.user.firstName} ${subscription.user.lastName}`,
      email: subscription.user.email,
      phoneNo: subscription.user.phoneNo,
      createdAt: subscription.user.createdAt,
      stripeCustomerId: subscription.user.stripeCustomerId,
      isTrial: subscription.user.isTrial,
    },

    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      isActive: subscription.plan.isActive,
      price: subscription.plan.price ?? 0,
      duration: subscription.plan.duration ?? 0,
      description: subscription.plan.description,
      features: subscription.plan.features.map((f: any) => ({
        id: f.id,
        name: f.name,
        description: f.description ?? "",
      })),
    },

    payment: subscription.payment ? {
        ...subscription.payment,
        amount: subscription.payment.amount ?? 0,
    } : null,

    status: subscription.status as SubscriptionStatus,

    startDate:
      subscription.startDate?.toISOString() ?? new Date().toISOString(),

    endDate:
      subscription.endDate?.toISOString() ?? new Date().toISOString(),

    createdAt: subscription.updatedAt.toISOString(),
  };
};
