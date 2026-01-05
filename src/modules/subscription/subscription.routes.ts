import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { requireAdmin } from "../../middleware/adminAuth";
import { changeUserSubscriptionPlan, createCheckoutSession, getAllSubscribedUsersAdmin, getSubscriptionDashboardAdmin, getSubscriptionDetailsAdmin, getUserSubscription, refundSubscriptionPaymentAdmin, revokeUserSubscriptionAdmin } from "./subscription.controller";

const router = Router();


/**
 * CREATE STRIPE CHECKOUT SESSION
 * User clicks "Subscribe"
 */
router.post(
  "/checkout",
  authRateLimiter,
  authenticateToken,
  createCheckoutSession
);

/**
 * Get current user's subscription details
 */
router.get("/me/subscription", authenticateToken, getUserSubscription);

/**
 * ===========================
 * ADMIN-FACING ROUTES
 * ===========================
 */

router.get(
  "/dashboard",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  getSubscriptionDashboardAdmin
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
  revokeUserSubscriptionAdmin
);

router.post(
  "/refund/:paymentIntentId",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  refundSubscriptionPaymentAdmin
);

router.post(
  "/change-plan/:userId",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  changeUserSubscriptionPlan
);


export default router;


