import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { validateDto } from "../../middleware/validateDto";
import { createSupportSchema } from "./support.validation";
import { createSupport } from "./support.controller";

const router = Router();

router.post(
  '/create',
  authRateLimiter,
  validateDto(createSupportSchema),
  createSupport
);

export default router;