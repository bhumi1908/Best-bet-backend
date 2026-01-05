import { Request, Response } from "express";
import Stripe from "stripe";
import stripe from "../config/stripe";
import prisma from "../config/prisma";
import { PaymentStatus } from "../generated/prisma/enums";

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  let event: Stripe.Event;

  try {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      return res.status(400).send("Missing stripe-signature header");
    }

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_KEY!
    );
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // CHECKOUT 
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (!session.metadata?.userId || !session.metadata?.planId) {
          throw new Error("Missing metadata in checkout session");
        }

        const userId = Number(session.metadata.userId);
        const planId = Number(session.metadata.planId);

        const plan = await prisma.subscriptionPlan.findUnique({
          where: { id: planId },
        });
        if (!plan) throw new Error("Subscription plan not found");

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
            status: "ACTIVE",
          },
        });
        break;
      }

      // PAYMENTS
      case "invoice.payment_succeeded": {
        try {

          const invoice = event.data.object as Stripe.Invoice & {
            subscription?: string | null;
            payment_intent?: string | null;
          };


          /*  Resolve Payment Status */
          const status: PaymentStatus =
            invoice.status === "paid"
              ? "SUCCESS"
              : invoice.status === "open" || invoice.status === "draft"
                ? "PENDING"
                : "FAILED";

          /*  Resolve Stripe Subscription ID */
          if (!invoice.subscription || typeof invoice.subscription !== "string") {
            console.warn("Invoice missing subscription", invoice.id);
            break;
          }

          const stripeSubscriptionId = invoice.subscription;

          /*  Retrieve Subscription (SAFE) */
          const stripeSubscription = await stripe.subscriptions.retrieve(
            stripeSubscriptionId
          );

          const userId = Number(stripeSubscription.metadata?.userId);
          if (!userId) {
            console.warn("Subscription missing userId metadata", stripeSubscriptionId);
            break;
          }

          /*  Resolve PaymentIntent ID */
          if (!invoice.payment_intent || typeof invoice.payment_intent !== "string") {
            console.warn("Invoice missing payment_intent", invoice.id);
            break;
          }

          const paymentIntentId = invoice.payment_intent;

          /*  Retrieve PaymentIntent (REQUIRED) */
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

          if (!paymentIntent) {
            console.warn("PaymentIntent not found", paymentIntentId);
            break;
          }

          /* Resolve Payment Method (BUG FIXED HERE) */
          let paymentMethod: string = "unknown";

          if (paymentIntent.payment_method) {
            if (typeof paymentIntent.payment_method === "string") {
              const pm = await stripe.paymentMethods.retrieve(
                paymentIntent.payment_method
              );
              paymentMethod = pm.type ?? "unknown";
            } else {
              paymentMethod = paymentIntent.payment_method.type ?? "unknown";
            }
          }

          /*  Upsert Payment (IDEMPOTENT) */
          const payment = await prisma.payment.upsert({
            where: { stripePaymentId: paymentIntentId },
            update: {
              status,
              amount: (invoice.amount_paid ?? 0) / 100,
              paymentMethod,
            },
            create: {
              userId,
              stripePaymentId: paymentIntentId,
              amount: (invoice.amount_paid ?? 0) / 100,
              status,
              paymentMethod,
            },
          });

          /* Save Stripe Customer ID (ONCE) */
          if (typeof invoice.customer === "string") {
            await prisma.user.updateMany({
              where: {
                id: userId,
                stripeCustomerId: null,
              },
              data: {
                stripeCustomerId: invoice.customer,
              },
            });
          }

          await prisma.userSubscription.updateMany({
            where: {
              userId,
              status: "TRIAL",
              isDeleted: false,
            },
            data: {
              status: "EXPIRED",
              endDate: new Date(),
              updatedAt: new Date(),
            },
          });

          /* Activate Subscription (LATEST ONLY) */
          await prisma.userSubscription.updateMany({
            where: {
              stripeSubscriptionId,
            },
            data: {
              status: "ACTIVE",
              paymentId: payment.id,
              updatedAt: new Date(),
            },
          });

          break;
        } catch (error) {
          console.error("invoice.payment_succeeded error:", error);
          break;
        }
      }


      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        break;
      }

      case "invoice_payment.paid": {
        break;
      }


      /* ---------------- SUBSCRIPTIONS ---------------- */
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

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
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        await prisma.userSubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "CANCELED" },
        });

        break;
      }

      /* ---------------- REFUNDS ---------------- */
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;

        const refundId =
          charge.refunds?.data?.[0]?.id ?? null;

        if (!refundId) {
          console.warn("Refund event without refund ID", charge.id);
          break;
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

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    res.status(500).send("Webhook handler failed");
  }
};
