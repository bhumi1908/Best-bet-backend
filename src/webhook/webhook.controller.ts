import { Request, Response } from "express";
import Stripe from "stripe";
import stripe from "../config/stripe";
import { handleStripeEvent } from "./webhook.service";

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
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    res.status(500).send("Webhook handler failed");
  }
};
