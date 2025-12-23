import { Router } from 'express';
import { getAllUsers, getUserById, updateUser } from './user.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/adminAuth';
import { validateDto, validateQuery } from '../../middleware/validateDto';
import { updateUserSchema, getUsersQuerySchema } from './user.validation';

const router = Router();

// Protected routes (Admin only)
router.get(
  '/',
  authenticateToken,
  requireAdmin,
  validateQuery(getUsersQuerySchema),
  getAllUsers
);

router.get(
  '/:id',
  authenticateToken,
  requireAdmin,
  getUserById
);

router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  validateDto(updateUserSchema),
  updateUser
);

export default router;

