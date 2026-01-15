import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { UserRole } from '../utils/constants/enums';
import { Role } from '../generated/prisma/enums';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role: Role;
        state?: { id: number; name: string; code: string | null } | null;
      };
    }
  }
}

export interface JWTPayload {
  id: number;
  email: string;
  role: UserRole
  state?: { id: number; name: string; code: string | null } | null;
}


export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'] as string | undefined;
    let token: string | undefined;

    // Priority: cookie > header
    if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
      console.log('🍪 Using token from cookie');

    } else if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
      console.log('🔑 Using token from header');

    }
    if (!token) {
      console.log('❌ No token found - returning 401');

      res.status(401).json({
        status: 'error',
        message: 'Access token is required',
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }
    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

      // Verify user still exists in database using Prisma
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          isInactive: true,
          role: true,
          state: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      if (!user) {
        res.status(401).json({
          status: 'error',
          message: 'User not found',
        });
        return;
      }

      if (user.isInactive) {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');

        res.status(403).json({
          status: 'error',
          message: 'Your account has been deactivated. Please contact support.',
        });
        return;
      }

      // Attach user to request object
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        state: user?.state || null,
      };

      next();
    } catch (jwtError: any) {
      // THIS IS THE KEY PART - Must return 401 for expired tokens
      console.log('❌ Token verification failed:', jwtError.message);

      if (jwtError instanceof jwt.TokenExpiredError) {
        console.log('⏰ Token expired - returning 401 to trigger refresh');
        res.status(401).json({
          status: 'error',
          message: 'Token expired',
        });
        return;
      }

      res.status(403).json({
        status: 'error',
        message: 'Invalid token',
      });
      return;
    }
  } catch (error) {
    console.error('Middleware error:', error);
    next(error);
  }
};
