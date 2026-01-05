import { Router } from "express";
import { authRateLimiter } from "../../../middleware/rateLimiter";
import { validateDto } from "../../../middleware/validateDto";
import { authenticateToken } from "../../../middleware/auth";
import { requireAdmin } from "../../../middleware/adminAuth";
import { changePassword, editProfileDetail } from "./profile.controller";
import { changePasswordSchema } from "./profile.validation";

const router = Router();

router.put(
  "/change-password",
  authenticateToken,
  authRateLimiter,
  validateDto(changePasswordSchema),
  changePassword
);

router.put(
  '/:id',
  authenticateToken,
  authRateLimiter,
  editProfileDetail
);


export default router;