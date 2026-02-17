import { Request, Response } from 'express';
import prisma from "../../../config/prisma";
import { HttpStatus, UserRole } from "../../../utils/constants/enums";
import { sendError, sendSuccess } from "../../../utils/helpers";
import bcrypt from "bcryptjs";

const PHONE_REGEX = /^\+?[1-9]\d{0,2}[\s.-]?\(?\d{1,4}\)?([\s.-]?\d{2,4}){2,4}$/

export const changePassword = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const id = Number(req.user?.id);
        const role = (req.user as any)?.role as UserRole | undefined;

        if (!id || isNaN(id)) {
            sendError(res, "Unauthorized access", HttpStatus.UNAUTHORIZED);
            return;
        }

        if (!role || ![UserRole.ADMIN, UserRole.USER].includes(role)) {
            sendError(res, "Unauthorized role", HttpStatus.FORBIDDEN);
            return;
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            sendError(
                res,
                "Current password and new password are required",
                HttpStatus.BAD_REQUEST
            );
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: id },
            select: {
                id: true,
                passwordHash: true,
                role: true,
            },
        });

        if (!user) {
            sendError(res, "User not found", HttpStatus.NOT_FOUND);
            return;
        }

        const isPasswordValid = await bcrypt.compare(
            currentPassword,
            user.passwordHash
        );

        if (!isPasswordValid) {
            sendError(
                res,
                "Current password is incorrect",
                HttpStatus.BAD_REQUEST
            );
            return;
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

        if (isSamePassword) {
            sendError(
                res,
                "New password must be different from the current password",
                HttpStatus.BAD_REQUEST
            );
            return;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: id },
            data: {
                passwordHash: hashedPassword,
            },
        });

        sendSuccess(
            res,
            null,
            "Password changed successfully",
            HttpStatus.OK
        );
    } catch (error: any) {
        console.error("Change password error:", error);

        if (error?.code === "P2025") {
            sendError(res, "User not found", HttpStatus.NOT_FOUND);
            return;
        }

        if (error?.code === "ECONNREFUSED" || error?.code === "P1001") {
            sendError(
                res,
                "Database connection failed. Please try again later.",
                HttpStatus.SERVICE_UNAVAILABLE
            );
            return;
        }

        sendError(
            res,
            error?.message || "Failed to change password",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

export const editProfileDetail = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const requesterId = Number(req.user?.id);
        const requesterRole = (req.user as any)?.role as UserRole | undefined;

        if (isNaN(id)) {
            sendError(res, 'Invalid user ID', HttpStatus.BAD_REQUEST);
            return;
        }

        if (!requesterRole || ![UserRole.ADMIN, UserRole.USER].includes(requesterRole)) {
            sendError(res, 'Unauthorized role', HttpStatus.FORBIDDEN);
            return;
        }

        if (!requesterId || isNaN(requesterId)) {
            sendError(res, 'Unauthorized access', HttpStatus.UNAUTHORIZED);
            return;
        }

        // Ensure users (including admins) can only edit their own profile
        if (requesterId !== id) {
            sendError(res, 'Forbidden: cannot edit another user profile', HttpStatus.FORBIDDEN);
            return;
        }

        const { firstName, lastName, phoneNo, stateId } = req.body;

        if (!firstName || !lastName || !phoneNo) {
            sendError(
                res,
                'First name, last name and phone number are required',
                HttpStatus.BAD_REQUEST
            );
            return;
        }

        const userExists = await prisma.user.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!userExists) {
            sendError(res, 'User not found', HttpStatus.NOT_FOUND);
            return;
        }

        // Check if phone number is being updated and if it already exists
        if (phoneNo !== undefined && phoneNo !== null) {
            const trimmedPhone = phoneNo.trim();

            if (!trimmedPhone) {
                sendError(
                    res,
                    'Phone number is required',
                    HttpStatus.BAD_REQUEST
                );
                return;
            }

            if (!PHONE_REGEX.test(trimmedPhone)) {
                sendError(
                    res,
                    'Please provide a valid phone number',
                    HttpStatus.BAD_REQUEST
                );
                return;
            }

            const existingPhone = await prisma.user.findFirst({
                where: {
                    phoneNo: phoneNo.trim(),
                    id: { not: id },
                },
                select: { id: true },
            });

            if (existingPhone) {
                sendError(res, 'Phone number already exists', HttpStatus.BAD_REQUEST);
                return;
            }
        }

        // Validate state if stateId is being updated
        if (stateId !== undefined && stateId !== null) {
            const state = await prisma.state.findUnique({
                where: { id: stateId },
                select: { id: true, isActive: true, isDeleted: true },
            });

            if (!state) {
                sendError(res, 'Invalid state selected', HttpStatus.BAD_REQUEST);
                return;
            }

            if (state.isDeleted || !state.isActive) {
                sendError(res, 'Selected state is not available', HttpStatus.BAD_REQUEST);
                return;
            }
        }

        const updateData: any = {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
        };

        if (phoneNo !== undefined && phoneNo !== null) {
            updateData.phoneNo = phoneNo.trim();
        }

        if (stateId !== undefined && stateId !== null) {
            updateData.stateId = stateId;
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phoneNo: true,
                stateId: true,
                state: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                role: true,
            },
        });

        sendSuccess(
            res,
            {
                user: updatedUser,
            },
            'Profile updated successfully',
            HttpStatus.OK
        );
    } catch (error: any) {
        console.error('Edit profile error:', error);

        // Prisma known errors
        if (error?.code === 'P2025') {
            sendError(
                res,
                'User not found',
                HttpStatus.NOT_FOUND
            );
            return;
        }

        // Database connection issues
        if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
            sendError(
                res,
                'Database connection failed. Please try again later.',
                HttpStatus.SERVICE_UNAVAILABLE
            );
            return;
        }

        sendError(
            res,
            error?.message || 'Failed to update profile',
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

