import { Router } from "express";
import {  createPlan, deletePlan, getAllPlansAdmin, getPlanByIdAdmin, updatePlan } from "./subscription-plan.controller";
import { validateDto } from "../../../middleware/validateDto";
import { authenticateToken } from "../../../middleware/auth";
import { requireAdmin } from "../../../middleware/adminAuth";
import { authRateLimiter } from "../../../middleware/rateLimiter";
import { createPlanSchema, updatePlanSchema } from "./subscription-plan.validation";

const router = Router();

//get All plan
router.get("/",
    authenticateToken,
    requireAdmin,
    authRateLimiter,
    getAllPlansAdmin
);

// GET PLAN BY ID
router.get(
    "/:id",
    authenticateToken,
    requireAdmin,
    authRateLimiter,
    getPlanByIdAdmin
);

//  CREATE PLAN
router.post(
  "/",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  validateDto(createPlanSchema),
  createPlan
);

// UPDATE PLAN
router.put(
  "/:id",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  validateDto(updatePlanSchema),
  updatePlan
);

// DELETE PLAN (SOFT DELETE)
router.delete(
  "/:id",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  deletePlan
);


export default router;