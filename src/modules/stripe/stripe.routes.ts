import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/adminAuth";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { getStripeIntegrationStatus } from "./stripe.controller";

const router = Router();

/**
 * STRIPE INTEGRATION STATUS (ADMIN ONLY)
 */
router.get(
  "/status",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  getStripeIntegrationStatus
);

export default router;
