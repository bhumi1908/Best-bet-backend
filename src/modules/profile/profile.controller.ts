import { Request, Response } from 'express';
import prisma from "../../config/prisma";
import { HttpStatus } from "../../utils/constants/enums";
import { sendError, sendSuccess } from "../../utils/helpers";
import bcrypt from "bcryptjs";

export const changeAdminPassword = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const adminId = Number(req.user?.id);

        if (!adminId || isNaN(adminId)) {
            sendError(res, "Unauthorized access", HttpStatus.UNAUTHORIZED);
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
            where: { id: adminId },
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

        if (user.role !== "ADMIN") {
            sendError(res, "Access denied", HttpStatus.FORBIDDEN);
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
            where: { id: adminId },
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

export const editAdminProfileDetail = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            sendError(res, 'Invalid user ID', HttpStatus.BAD_REQUEST);
            return;
        }

        const { firstName, lastName } = req.body;

        if (!firstName || !lastName) {
            sendError(
                res,
                'First name and last name are required',
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

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
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

