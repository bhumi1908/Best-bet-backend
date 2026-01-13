import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { requireAdmin } from "../../middleware/adminAuth";
import { cancelScheduledPlanChange, changeUserSubscriptionPlan, changeUserSubscriptionPlanSelf, createCheckoutSession, getAllSubscribedUsersAdmin, getSubscriptionDashboardAdmin, getSubscriptionDetailsAdmin, getUserSubscription, refundSubscriptionPaymentAdmin, revokeUserSubscriptionAdmin, revokeUserSubscriptionSelf } from "./subscription.controller";

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
router.get("/me", authenticateToken, getUserSubscription);

// Cancel subscription (at period end)
router.post("/me/revoke", authenticateToken, revokeUserSubscriptionSelf);

// Change plan
router.post("/me/change-plan", authenticateToken, changeUserSubscriptionPlanSelf);

// Cancel schedule plan
router.post("/me/cancel/schedule-plan", authenticateToken, cancelScheduledPlanChange);

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


