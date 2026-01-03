import { Request, Response } from "express";
import stripe from "../config/stripe";
import Stripe from "stripe";
import prisma from "../config/prisma";

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  let event: Stripe.Event;

  try {
    // Stripe requires raw body, so make sure you use `express.raw({ type: "application/json" })` in route
    const sig = req.headers["stripe-signature"] as string;
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_KEY as string
    );
  } catch (error: any) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = parseInt(session.metadata?.userId || "0");
        const planId = parseInt(session.metadata?.planId || "0");

        if (!userId || !planId) {
          console.error("Webhook missing userId or planId in metadata");
          return res.status(400).send("Invalid metadata");
        }

        // Find plan details
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan) throw new Error("Subscription plan not found");

        // Calculate subscription endDate (based on duration and trialDays)
        const startDate = new Date();
        let endDate = new Date();
        if (plan.trialDays && plan.trialDays > 0) {
          endDate.setDate(endDate.getDate() + plan.trialDays);
        } else if (plan.duration && plan.duration > 0) {
          endDate.setMonth(endDate.getMonth() + plan.duration);
        }

        // Create UserSubscription
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

        console.log(`User ${userId} subscription created for plan ${planId}`);
        break;

      case "invoice.payment_succeeded":
        // Optionally update subscription status in DB if needed
        console.log("Payment succeeded for invoice:", event.data.object);
        break;

      case "invoice.payment_failed":
        console.log("Payment failed for invoice:", event.data.object);
        break;

      case "customer.subscription.deleted":
        const deletedSub = event.data.object as Stripe.Subscription;
        await prisma.userSubscription.updateMany({
          where: { stripeSubscriptionId: deletedSub.id },
          data: { status: "CANCELED" },
        });
        console.log(`Subscription ${deletedSub.id} marked as canceled`);
        break;

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook processing error:", error.message);
    res.status(500).send("Internal server error");
  }
};
