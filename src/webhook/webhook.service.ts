import Stripe from "stripe";
import prisma from "../config/prisma";
import stripe from "../config/stripe";
import { PaymentStatus } from "../generated/prisma/enums";

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

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId, isDeleted: false },
  });
  if (!plan) throw new Error("Subscription plan not found");

  // Prevent duplicate overlap
  const existingActive = await prisma.userSubscription.findFirst({
    where: {
      userId,
      isDeleted: false,
      status: { in: ["ACTIVE", "TRIAL"] },
      endDate: { gt: new Date() },
    },
  });
  if (existingActive) {
    // Avoid creating overlapping subscriptions; just noop
    return;
  }

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
      planId,
      startDate,
      endDate,
      stripeSubscriptionId: session.subscription as string,
      status: plan.trialDays && plan.trialDays > 0 ? "TRIAL" : "ACTIVE",
    },
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

  const payment = await prisma.payment.upsert({
    where: { stripePaymentId: paymentIntentId },
    update: {
      status,
      amount: (inv.amount_paid ?? 0) / 100,
      paymentMethod,
    },
    create: {
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

  await prisma.userSubscription.updateMany({
    where: {
      userId,
      status: "TRIAL",
      isDeleted: false,
      endDate: { lt: new Date() },
    },
    data: {
      status: "EXPIRED",
      endDate: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.userSubscription.updateMany({
    where: { stripeSubscriptionId },
    data: {
      status: "ACTIVE",
      startDate: new Date(inv.period_start * 1000),
      endDate: new Date(invoice.period_end * 1000),
      paymentId: payment.id,
      updatedAt: new Date(),
    },
  });
};

const handleSubscriptionUpdated = async (subscription: Stripe.Subscription) => {
  await prisma.userSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status:
        subscription.status === "active"
          ? "ACTIVE"
          : subscription.status === "trialing"
            ? "TRIAL"
            : "EXPIRED",
    },
  });
};

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
  await prisma.userSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: "CANCELED" },
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
