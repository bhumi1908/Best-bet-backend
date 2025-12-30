import { Request, Response } from "express";
import HttpStatus from "http-status-codes";
import prisma from "../../config/prisma";
import { sendError, sendSuccess } from "../../utils/helpers";

// Get all active subscription plans
export const getAllPlans = async (req: Request, res: Response) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isDeleted: false, isActive: true },
            select: {
                id: true,
                name: true,
                price: true,
                duration: true,
                description: true,
                isRecommended: true,
                isActive: true,
                features: {
                    where: { isDeleted: false },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                    },
                },
            },
            orderBy: { price: "asc" },
        });

        sendSuccess(res, { plans }, "Subscription plans fetched successfully", HttpStatus.OK);
    } catch (error: any) {
        console.error("Fetch subscription plans error:", error);
        sendError(
            res,
            error?.message || "Failed to fetch subscription plans",
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};