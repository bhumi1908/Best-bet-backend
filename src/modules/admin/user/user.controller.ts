import { Request, Response } from 'express';
import prisma from '../../../config/prisma';
import { sendSuccess, sendError } from '../../../utils/helpers/response';
import { HttpStatus, UserRole } from '../../../utils/constants/enums';

// Get All Users
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const role = req.query.role as UserRole | undefined;
    const isInactive = req.query.isInactive === 'true' ? true : req.query.isInactive === 'false' ? false : undefined;
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    // Build where clause
    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (isInactive !== undefined) {
      where.isInactive = isInactive;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phoneNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNo: true,
          role: true,
          isInactive: true,
          createdAt: true,
          updatedAt: true,
            subscriptions: {
          where: {
            isDeleted: false,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,

            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                duration: true,
                isRecommended: true,
              },
            },
          },
        }
        },
        skip,
        take: limit,
        orderBy,
      }),
      prisma.user.count({ where }),
    ]);

    sendSuccess(
      res,
      {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Users retrieved successfully'
    );
  } catch (error: any) {
    console.error('Get all users error:', error);

    if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
      sendError(
        res,
        'Database connection failed. Please check your database configuration and ensure PostgreSQL is running.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to retrieve users',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// Get User by ID
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      sendError(res, 'Invalid user ID', HttpStatus.BAD_REQUEST);
      return;
    }

    // Get user by ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNo: true,
        role: true,
        isInactive: true,
        createdAt: true,
        updatedAt: true,
       subscriptions: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
                duration: true,
                isRecommended: true,
              },
            },
            payment: {
              select: {
                amount: true,
                paymentMethod: true,
                createdAt: true,
              },
            },
          },
        },
        payments: {
          where: { isDeleted: false },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!user) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

     // Current active subscription (latest with status ACTIVE)
    const activeSubscription = user.subscriptions.find(
      (sub) => sub.status === 'ACTIVE'
    ) || null;

    // Total payments
    const totalPaid = user.payments.reduce((acc, p) => acc + p.amount, 0);

    // Subscription age in days
    const subscriptionAge =
      activeSubscription && activeSubscription.startDate
        ? Math.floor(
            (new Date().getTime() - new Date(activeSubscription.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

    // Map subscriptions for response
    const allSubscriptions = user.subscriptions.map((sub) => ({
      id: sub.id,
      planName: sub.plan.name,
      price: sub.plan.price,
      startDate: sub.startDate,
      endDate: sub.endDate,
      status: sub.status,
      paymentMethod: sub.payment?.paymentMethod || 'N/A',
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }));

    // Final response
    const response = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNo: user.phoneNo,
      role: user.role,
      isInactive: user.isInactive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      currentSubscription: activeSubscription
        ? {
            id: activeSubscription.id,
            planName: activeSubscription.plan.name,
            price: activeSubscription.plan.price,
            startDate: activeSubscription.startDate,
            endDate: activeSubscription.endDate,
            status: activeSubscription.status,
            paymentMethod: activeSubscription.payment?.paymentMethod || 'N/A',
          }
        : null,
      totalPayments: totalPaid,
      subscriptionAgeDays: subscriptionAge,
      allSubscriptions,
    };

    sendSuccess(
      res,
      response,
      'User retrieved successfully'
    );
  } catch (error: any) {
    console.error('Get user by ID error:', error);

    if (error?.code === 'P2025') {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
      sendError(
        res,
        'Database connection failed. Please check your database configuration and ensure PostgreSQL is running.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to retrieve user',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// Update User
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.id);
    const { firstName, lastName, phoneNo, role, isInactive } = req.body;
    const currentUserId = req.user?.id;

    if (isNaN(userId)) {
      sendError(res, 'Invalid user ID', HttpStatus.BAD_REQUEST);
      return;
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isInactive: true,
      },
    });

    if (!existingUser) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Business rules: Cannot modify own role or deactivate own account
    if (userId === currentUserId) {
      if (role !== undefined && role !== existingUser.role) {
        sendError(
          res,
          'You cannot change your own role',
          HttpStatus.FORBIDDEN
        );
        return;
      }

      if (isInactive !== undefined && isInactive === true && !existingUser.isInactive) {
        sendError(
          res,
          'You cannot deactivate your own account',
          HttpStatus.FORBIDDEN
        );
        return;
      }
    }

    // Build update data
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phoneNo !== undefined) updateData.phoneNo = phoneNo;
    if (role !== undefined) updateData.role = role;
    if (isInactive !== undefined) updateData.isInactive = isInactive;

    // Check if phone number is being updated and if it already exists
    if (phoneNo !== undefined && phoneNo !== null) {
      const existingPhone = await prisma.user.findFirst({
        where: {
          phoneNo: phoneNo,
          id: { not: userId },
        },
        select: { id: true },
      });

      if (existingPhone) {
        sendError(res, 'Phone number already exists', HttpStatus.BAD_REQUEST);
        return;
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNo: true,
        role: true,
        isInactive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    sendSuccess(
      res,
      updatedUser,
      'User updated successfully'
    );
  } catch (error: any) {
    console.error('Update user error:', error);

    if (error?.code === 'P2025') {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
      sendError(
        res,
        'Database connection failed. Please check your database configuration and ensure PostgreSQL is running.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to update user',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

