import { Router } from "express";
import { authRateLimiter } from "../../../middleware/rateLimiter";
import { validateDto } from "../../../middleware/validateDto";
import { authenticateToken } from "../../../middleware/auth";
import { requireAdmin } from "../../../middleware/adminAuth";
import { changeAdminPassword, editAdminProfileDetail } from "./profile.controller";
import { changePasswordSchema } from "./profile.validation";

const router = Router();

router.put(
  "/change-password",
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  validateDto(changePasswordSchema),
  changeAdminPassword
);

router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  authRateLimiter,
  editAdminProfileDetail
);


export default router;