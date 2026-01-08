import Stripe from "stripe";
import prisma from "../config/prisma";
import stripe from "../config/stripe";
import { PaymentStatus, SubscriptionStatus } from "../generated/prisma/enums";

const resolvePaymentMethod = async (paymentMethod: Stripe.PaymentMethod | string | null) => {
  if (!paymentMethod) return "unknown";

  if (typeof paymentMethod === "string") {
    const pm = await stripe.paymentMethods.retrieve(paymentMethod);
    return pm.type ?? "unknown";
  }

  return paymentMethod.type ?? "unknown";
};

const activateSubscriptionFromCheckout = async (session: Stripe.Checkout.Session) => {
  console.log('Fire the chheckout session completed webhook');
  
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
  console.log('Fire the invoice payment succeeded webhook');
  console.log('Fire-1');
  
  const inv = invoice as Stripe.Invoice & {
    subscription?: string | null;
    payment_intent?: string | null;
  };
  console.log('Fire-2');
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
  console.log('Fire-3');
  const stripeSubscriptionId = inv.subscription;
  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  
  const userId = Number(stripeSubscription.metadata?.userId);
  if (!userId) {
    console.warn("Subscription missing userId metadata", stripeSubscriptionId);
    return;
  }
  console.log('Fire-4');
  if (!inv.payment_intent || typeof inv.payment_intent !== "string") {
    console.warn("Invoice missing payment_intent", inv.id);
    return;
  }
  console.log('Fire-5');
  const paymentIntentId = inv.payment_intent;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    console.warn("PaymentIntent not found", paymentIntentId);
    return;
  }
  console.log('Fire-6');
  const paymentMethod = await resolvePaymentMethod(paymentIntent.payment_method);

  console.log('Fire-7');
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
  console.log('Fire-8');
  if (typeof inv.customer === "string") {
    await prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data: { stripeCustomerId: inv.customer },
    });
  }
  console.log('Fire-9');
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
  console.log('Fire-10');
  const dbSubscription = await prisma.userSubscription.findFirst({
    where: {
      stripeSubscriptionId,
      isDeleted: false,
    },
  });
  console.log('Fire-11');
  if (!dbSubscription) {
    console.warn("DB subscription not found", stripeSubscriptionId);
    return;
  }

  const subscriptionLine = inv.lines.data.find(
    (line) => typeof line.subscription === "string"
  );
  console.log('Fire-12');
  if (!subscriptionLine) {
    console.warn("No subscription line found", inv.id);
    return;
  }
  console.log('Fire-13');
  const { start, end } = subscriptionLine.period;
  console.log('Fire-14');
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);
  console.log('Fire-15');     
  const updatePayload: any = {
    status: "ACTIVE",
    startDate: startDate,
    endDate: endDate,
    paymentId: payment.id,
    updatedAt: new Date(),
  };
  console.log('Fire-16');
  if (
    dbSubscription.nextPlanId &&
    dbSubscription.scheduledChangeAt &&
    new Date() >= dbSubscription.scheduledChangeAt
  ) {
    updatePayload.planId = dbSubscription.nextPlanId;
    updatePayload.nextPlanId = null;
    updatePayload.scheduledChangeAt = null;
  }
  console.log('Fire-17');
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
  console.log('Fire the subscription updated webhook');
  if (subscription.cancel_at_period_end) {
    return;
  }
  if (subscription.status === "canceled") {
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

    default:
      return;
  }

  await prisma.userSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status,
      updatedAt: new Date(),
    },
  });
};


const handleSubscriptionDeleted = async (
  subscription: Stripe.Subscription
) => {
  console.log('Fire the subscription deleted webhook');
  const canceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000)
    : new Date();

  await prisma.userSubscription.updateMany({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    data: {
      status: "CANCELED",
      endDate: canceledAt,
      updatedAt: new Date(),
    },
  });
};


const handleChargeRefunded = async (charge: Stripe.Charge) => {
  console.log('Fire the charge refunded webhook');
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
