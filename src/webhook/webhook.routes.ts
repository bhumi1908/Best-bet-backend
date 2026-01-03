import { Router } from "express";
import { stripeWebhookHandler } from "./webhook.controller";

const router = Router();

/**
 * Stripe Webhook
 * This route must receive raw body for Stripe signature verification
 */
router.post("/stripe", stripeWebhookHandler);

export default router;
