import { Router } from 'express';
import { register, login, refreshToken, forgotPassword, resetPassword, logout } from './auth.controller';
import { validateDto } from '../../middleware/validateDto';
import { registerSchema, loginSchema, forgotPassSchema, resetPasswordSchema } from './auth.validation';
import { authenticateToken } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Public routes
router.post(
  '/register',
  authRateLimiter,
  validateDto(registerSchema),
  register
);

router.post(
  '/login',
  authRateLimiter,
  validateDto(loginSchema),
  login
);

//Refresh token routes
router.post(
  '/refresh-token',
  authRateLimiter,
  refreshToken
);

//Forgot-password routes
router.post(
  '/forgot-password',
  authRateLimiter,
  validateDto(forgotPassSchema),
  forgotPassword
);

//Reset-password routes
router.post(
  '/reset-password',
  authRateLimiter,
  validateDto(resetPasswordSchema),
  resetPassword
);

router.post('/logout', authenticateToken, logout);


export default router;

