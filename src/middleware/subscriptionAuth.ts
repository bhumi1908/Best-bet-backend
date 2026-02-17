import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { sendError } from '../utils/helpers/response';
import { HttpStatus } from '../utils/constants/enums';

/**
 * Middleware to check if user has an active subscription
 * Grants access only if subscription is ACTIVE or TRIAL and not expired
 * Blocks access for CANCELED (if expired), REFUNDED, EXPIRED, PAST_DUE
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    const userId = req.user?.id;
    
    if (!userId) {
      sendError(res, 'User not authenticated', HttpStatus.UNAUTHORIZED);
      return;
    }
    if (user?.role === 'ADMIN') {
      return next();
    }

    const now = new Date();
    
    // Find active subscription
    const subscription = await prisma.userSubscription.findFirst({
      where: {
        userId,
        isDeleted: false,
        status: { in: ['ACTIVE', 'TRIAL'] },
        endDate: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      sendError(
        res,
        'Active subscription required to access this resource',
        HttpStatus.FORBIDDEN
      );
      return;
    }

    // Double-check: if subscription has expired, deny access
    if (subscription.endDate <= now) {
      // Update status to EXPIRED if not already
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'EXPIRED',
          updatedAt: now,
        },
      });
      
      sendError(
        res,
        'Your subscription has expired. Please renew to continue.',
        HttpStatus.FORBIDDEN
      );
      return;
    }

    // Attach subscription to request for use in controllers
    (req as any).subscription = subscription;
    
    next();
  } catch (error) {
    console.error('Subscription auth middleware error:', error);
    sendError(
      res,
      'Failed to verify subscription status',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
