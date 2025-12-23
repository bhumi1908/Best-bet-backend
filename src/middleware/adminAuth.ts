import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { UserRole } from '../utils/constants/enums';
import { HttpStatus } from '../utils/constants/enums';
import { sendError } from '../utils/helpers/response';

/**
 * Middleware to ensure the authenticated user has ADMIN role
 * Must be used after authenticateToken middleware
 * Fetches user role from database to ensure it's up-to-date
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'User not authenticated', HttpStatus.UNAUTHORIZED);
      return;
    }

    // Fetch user role from database to ensure it's current
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { 
        id: true,
        role: true,
        isInactive: true,
      },
    });

    if (!user) {
      sendError(res, 'User not found', HttpStatus.UNAUTHORIZED);
      return;
    }

    if (user.isInactive) {
      sendError(res, 'Your account has been deactivated', HttpStatus.FORBIDDEN);
      return;
    }

    if (user.role !== UserRole.ADMIN) {
      sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
      return;
    }

    // Attach role to request for convenience
    (req.user as any).role = user.role;
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    sendError(res, 'Authorization check failed', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

