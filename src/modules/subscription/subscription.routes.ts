import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { requireAdmin } from "../../middleware/adminAuth";
import { getAllSubscribedUsersAdmin, getSubscriptionDetailsAdmin } from "./subscription.controller";

const router = Router();

/**
 * CREATE STRIPE CHECKOUT SESSION
 * User clicks "Subscribe"
 */
router.post(
    "/checkout",
    authRateLimiter,
    // createCheckoutSession
);

router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  getAllSubscribedUsersAdmin
);

router.get(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  getSubscriptionDetailsAdmin
);

router.post(
  "/users/:userId/revoke",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
//   revokeUserSubscriptionAdmin
);

router.post(
  "/refund/:paymentIntentId",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
//   refundSubscriptionPaymentAdmin
);

/**
 * ADMIN UPGRADE / DOWNGRADE USER PLAN
 */
router.post(
    "/change-plan/:userId",
    authenticateToken,
    requireAdmin,
    authRateLimiter,
    // changeUserSubscriptionPlan
);

export default router;
