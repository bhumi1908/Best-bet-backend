import Stripe from "stripe";
import prisma from "../config/prisma";
import stripe from "../config/stripe";
import { PaymentStatus, SubscriptionStatus } from "../generated/prisma/enums";
import { HttpStatus } from "../utils/constants/enums";
import { sendError } from "../utils/helpers";

const resolvePaymentMethod = async (paymentMethod: Stripe.PaymentMethod | string | null) => {
  if (!paymentMethod) return "unknown";

  if (typeof paymentMethod === "string") {
    const pm = await stripe.paymentMethods.retrieve(paymentMethod);
    return pm.type ?? "unknown";
  }

  return paymentMethod.type ?? "unknown";
};

const activateSubscriptionFromCheckout = async (session: Stripe.Checkout.Session) => {

  if (!session.metadata?.userId || !session.metadata?.planId) {
    throw new Error("Missing metadata in checkout session");
  }

  const userId = Number(session.metadata.userId);
  const planId = Number(session.metadata.planId);
  const stripeSubscriptionId = session.subscription as string;

  // Idempotency check: if subscription already exists with this Stripe ID, skip
  const existing = await prisma.userSubscription.findFirst({
    where: {
      stripeSubscriptionId,
      isDeleted: false,
    },
  });
  if (existing) {
    sendError(null as any, "Subscription already exists for Stripe subscription", HttpStatus.BAD_REQUEST);
    return;
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId, isDeleted: false },
  });
  if (!plan) throw new Error("Subscription plan not found");

  // Expire any existing active subscriptions immediately and create new paid subscription
  // Use single transaction to ensure atomicity - no overlap possible
  const now = new Date();
  const startDate = new Date();
  let endDate = new Date(startDate);

  if (plan.trialDays && plan.trialDays > 0) {
    endDate.setDate(endDate.getDate() + plan.trialDays);
  } else if (plan.duration && plan.duration > 0) {
    endDate.setMonth(endDate.getMonth() + plan.duration);
  }

  await prisma.$transaction(async (tx) => {
    // Step 1: Find and expire all existing active subscriptions for this user
    const existingActive = await tx.userSubscription.findMany({
      where: {
        userId,
        isDeleted: false,
        status: { in: ["ACTIVE", "TRIAL"] },
        endDate: { gt: now },
      },
    });

    // Expire all existing subscriptions immediately to prevent overlap
    if (existingActive.length > 0) {
      await tx.userSubscription.updateMany({
        where: {
          id: { in: existingActive.map(sub => sub.id) },
        },
        data: {
          status: "EXPIRED",
          endDate: now, // Immediate expiration
          updatedAt: now,
          nextPlanId: null,
          scheduledChangeAt: null,
        },
      });
    }

    // Step 2: Create new paid subscription immediately
    await tx.userSubscription.create({
      data: {
        userId,
        planId,
        startDate,
        endDate,
        stripeSubscriptionId: stripeSubscriptionId,
        status: plan.trialDays && plan.trialDays > 0 ? "TRIAL" : "ACTIVE",
      },
    });
    
    // Step 3: Mark user as having used trial if applicable
    if (plan.trialDays && plan.trialDays > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { isTrial: true },
      });
    }
  });
};

const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {

  const inv = invoice as Stripe.Invoice & {
    subscription?: string | null;
    payment_intent?: string | null;
  };
  const status: PaymentStatus =
    inv.status === "paid"
      ? "SUCCESS"
      : inv.status === "open" || inv.status === "draft"
        ? "PENDING"
        : "FAILED";

  if (!inv.subscription || typeof inv.subscription !== "string") {
    console.warn("Invoice missing subscription", inv.id);
    return;
  }

  const stripeSubscriptionId = inv.subscription;
  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const userId = Number(stripeSubscription.metadata?.userId);
  if (!userId) {
    console.warn("Subscription missing userId metadata", stripeSubscriptionId);
    return;
  }
  if (!inv.payment_intent || typeof inv.payment_intent !== "string") {
    console.warn("Invoice missing payment_intent", inv.id);
    return;
  }
  const paymentIntentId = inv.payment_intent;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    console.warn("PaymentIntent not found", paymentIntentId);
    return;
  }
  const paymentMethod = await resolvePaymentMethod(paymentIntent.payment_method);

  // Idempotency: Check if payment already processed
  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentId: paymentIntentId },
  });
  
  const payment = existingPayment 
    ? await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status,
          amount: (inv.amount_paid ?? 0) / 100,
          paymentMethod,
        },
      })
    : await prisma.payment.create({
        data: {
          userId,
          stripePaymentId: paymentIntentId,
          amount: (inv.amount_paid ?? 0) / 100,
          status,
          paymentMethod,
        },
      });
  if (typeof inv.customer === "string") {
    await prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data: { stripeCustomerId: inv.customer },
    });
  }
  // Expire TRIAL subscriptions that have passed their end date
  const now = new Date();
  await prisma.userSubscription.updateMany({
    where: {
      userId,
      status: "TRIAL",
      isDeleted: false,
      endDate: { lte: now }, // Use lte instead of lt for consistency
    },
    data: {
      status: "EXPIRED",
      updatedAt: now,
      nextPlanId: null,
      scheduledChangeAt: null,
    },
  });
  // Find subscription by Stripe ID
  const dbSubscription = await prisma.userSubscription.findFirst({
    where: {
      stripeSubscriptionId,
      isDeleted: false,
    },
  });

  if (!dbSubscription) {
    console.warn("DB subscription not found for invoice payment", stripeSubscriptionId);
    return;
  }

  // Don't update if subscription is already expired, refunded, or canceled
  if (dbSubscription.status === "EXPIRED" || 
      dbSubscription.status === "REFUNDED" || 
      dbSubscription.status === "CANCELED") {
    console.log(`Subscription ${dbSubscription.id} is ${dbSubscription.status}, skipping invoice update`);
    return;
  }

  const subscriptionLine = inv.lines.data.find(
    (line) => typeof line.subscription === "string"
  );
  if (!subscriptionLine) {
    console.warn("No subscription line found", inv.id);
    return;
  }
  const { start, end } = subscriptionLine.period;
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);
  
  // Handle scheduled plan changes: expire old subscription and update current one
  if (
    dbSubscription.nextPlanId &&
    dbSubscription.scheduledChangeAt &&
    now >= dbSubscription.scheduledChangeAt
  ) {
    const nextPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: dbSubscription.nextPlanId, isDeleted: false },
    });

    if (nextPlan) {
      // Update current subscription to new plan (no need to create new one since Stripe subscription continues)
      await prisma.userSubscription.update({
        where: { id: dbSubscription.id },
        data: {
          planId: dbSubscription.nextPlanId,
          status: "ACTIVE",
          startDate: startDate,
          endDate: endDate,
          paymentId: payment.id,
          nextPlanId: null,
          scheduledChangeAt: null,
          updatedAt: now,
        },
      });

      console.log(`Scheduled plan change completed for subscription ${dbSubscription.id}`);
      return; // Exit early since we updated the subscription
    }
  }

  // Idempotency: Only update if dates have changed or status needs updating
  const needsUpdate = 
    dbSubscription.startDate.getTime() !== startDate.getTime() ||
    dbSubscription.endDate.getTime() !== endDate.getTime() ||
    dbSubscription.status !== "ACTIVE" ||
    dbSubscription.paymentId !== payment.id;
    
  if (!needsUpdate) {
    console.log(`Subscription ${dbSubscription.id} already up to date, skipping update`);
    return;
  }
  
  const updatePayload: any = {
    status: "ACTIVE",
    startDate: startDate,
    endDate: endDate,
    paymentId: payment.id,
    updatedAt: now,
  };
  
  await prisma.userSubscription.update({
    where: { id: dbSubscription.id },
    data: updatePayload,
  });


};
const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const inv = invoice as Stripe.Invoice & {
    subscription?: string | null;
    payment_intent?: string | null;
  };
  if (!inv.subscription || typeof inv.subscription !== "string") {
    console.warn("Payment failed: missing subscription", invoice.id);
    return;
  }

  const stripeSubscriptionId = inv.subscription;

  const dbSubscription = await prisma.userSubscription.findFirst({
    where: {
      stripeSubscriptionId,
      isDeleted: false,
    },
  });
  if (!dbSubscription) {
    console.warn("Payment failed: DB subscription not found", stripeSubscriptionId);
    return;
  }

  await prisma.userSubscription.update({
    where: { id: dbSubscription.id },
    data: {
      status: "PAST_DUE",
      updatedAt: new Date(),
    },
  });
};


const handleSubscriptionUpdated = async (
  subscription: Stripe.Subscription
) => {
  // Idempotency: Check if subscription exists
  const dbSubscription = await prisma.userSubscription.findFirst({
    where: { 
      stripeSubscriptionId: subscription.id,
      isDeleted: false,
    },
  });
  
  if (!dbSubscription) {
    console.warn(`Subscription not found for Stripe subscription ${subscription.id}`);
    return;
  }
  
  // If subscription is scheduled to cancel at period end, mark as CANCELED
  if (subscription.cancel_at_period_end) {
    // Only update if not already CANCELED
    if (dbSubscription.status !== "CANCELED") {
      await prisma.userSubscription.update({
        where: { id: dbSubscription.id },
        data: {
          status: "CANCELED",
          updatedAt: new Date(),
        },
      });
    }
    return;
  }
  
  // If subscription is canceled in Stripe, mark as CANCELED
  if (subscription.status === "canceled") {
    if (dbSubscription.status !== "CANCELED") {
      const canceledAt = subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : new Date();
      await prisma.userSubscription.update({
        where: { id: dbSubscription.id },
        data: {
          status: "CANCELED",
          endDate: canceledAt,
          updatedAt: new Date(),
        },
      });
    }
    return;
  }

  let status: SubscriptionStatus;

  switch (subscription.status) {
    case "active":
      status = "ACTIVE";
      break;

    case "trialing":
      status = "TRIAL";
      break;

    case "incomplete_expired":
      status = "EXPIRED";
      break;

    case "past_due":
      status = "PAST_DUE";
      break;

    default:
      return;
  }

  // Only update if status has changed
  if (dbSubscription.status !== status) {
    await prisma.userSubscription.update({
      where: { id: dbSubscription.id },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }
};


const handleSubscriptionDeleted = async (
  subscription: Stripe.Subscription
) => {
  // Idempotency: Check if subscription exists and needs update
  const dbSubscription = await prisma.userSubscription.findFirst({
    where: {
      stripeSubscriptionId: subscription.id,
      isDeleted: false,
    },
  });
  
  if (!dbSubscription) {
    console.warn(`Subscription not found for deleted Stripe subscription ${subscription.id}`);
    return;
  }
  
  // Only update if not already CANCELED or EXPIRED
  if (dbSubscription.status === "CANCELED" || dbSubscription.status === "EXPIRED") {
    console.log(`Subscription ${dbSubscription.id} already ${dbSubscription.status}, skipping update`);
    return;
  }
  
  const canceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000)
    : new Date();

  await prisma.userSubscription.update({
    where: { id: dbSubscription.id },
    data: {
      status: "CANCELED",
      endDate: canceledAt,
      updatedAt: new Date(),
      nextPlanId: null,
      scheduledChangeAt: null,
    },
  });
};

const handleChargeRefunded = async (charge: Stripe.Charge) => {
  const refundId = charge.refunds?.data?.[0]?.id ?? null;

  if (!refundId) {
    console.warn("Refund event without refund ID", charge.id);
    return;
  }

  await prisma.refund.create({
    data: {
      userId: Number(charge.metadata?.userId),
      paymentId: Number(charge.metadata?.paymentId),
      amount: (charge.amount_refunded ?? 0) / 100,
      status: "SUCCESS",
      stripeRefundId: refundId,
    },
  });
};

export const handleStripeEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case "checkout.session.completed":
      await activateSubscriptionFromCheckout(event.data.object as Stripe.Checkout.Session);
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;

    case "invoice.payment_failed":
    case "invoice_payment.paid":
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
};
