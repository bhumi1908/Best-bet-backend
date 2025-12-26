import { Request, Response } from "express";
import HttpStatus from "http-status-codes";
import prisma from "../../../config/prisma";
import { sendError, sendSuccess } from "../../../utils/helpers";

// Get All plan Admin
export const getAllPlansAdmin = async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        price: true,
        duration: true,
        description: true,
        isRecommended: true,
        isActive: true,
        features: {
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    sendSuccess(
      res,
      { plans },
      "Subscription plans fetched successfully",
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error("Admin fetch plans error:", error);
    sendError(
      res,
      error?.message || "Failed to fetch subscription plans",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

//Get plan by ID Admin
export const getPlanByIdAdmin = async (req: Request, res: Response) => {
  try {
    const planId = Number(req.params.id);

    if (isNaN(planId)) {
      return sendError(res, "Invalid subscription plan ID", HttpStatus.BAD_REQUEST);
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        id: planId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        price: true,
        duration: true,
        description: true,
        isRecommended: true,
        isActive: true,
        features: {
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!plan) {
      return sendError(
        res,
        "Subscription plan not found",
        HttpStatus.NOT_FOUND
      );
    }

    sendSuccess(
      res,
      { plan },
      "Subscription plan fetched successfully",
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error("Admin fetch plan by ID error:", error);
    sendError(
      res,
      error?.message || "Failed to fetch subscription plan",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// CREATE SUBSCRIPTION PLAN
export const createPlan = async (req: Request, res: Response) => {
  try {
    const {
      name,
      price,
      duration,
      description,
      isRecommended,
      isActive,
      features = [],
    } = req.body;

    const existingPlan = await prisma.subscriptionPlan.findFirst({
      where: { name, isDeleted: false },
    });

    if (existingPlan) {
      return sendError(
        res,
        "Subscription plan with this name already exists",
        HttpStatus.CONFLICT
      );
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        price,
        duration,
        description,
        isRecommended,
        isActive,
        features: {
          create: features.map((f: any) => ({
            name: f.name,
            description: f.description,
          })),
        },
      },
      include: {
        features: {
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    sendSuccess(
      res,
      { plan },
      "Subscription plan created successfully",
      HttpStatus.CREATED
    );
  } catch (error: any) {
    console.error("Create plan error:", error);
    sendError(
      res,
      error?.message || "Failed to create subscription plan",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

//  UPDATE SUBSCRIPTION PLAN
export const updatePlan = async (req: Request, res: Response) => {
  try {
    const planId = Number(req.params.id);

    if (isNaN(planId)) {
      return sendError(res, "Invalid subscription plan ID", HttpStatus.BAD_REQUEST);
    }

    const {
      name,
      price,
      duration,
      description,
      isRecommended,
      isActive,
    } = req.body;

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, isDeleted: false },
    });

    if (!plan) {
      return sendError(res, "Subscription plan not found", HttpStatus.NOT_FOUND);
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        name,
        price,
        duration,
        description,
        isRecommended,
        isActive,
      },
    });

    sendSuccess(
      res,
      { plan: updatedPlan },
      "Subscription plan updated successfully",
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error("Update plan error:", error);
    sendError(
      res,
      error?.message || "Failed to update subscription plan",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// DELETE SUBSCRIPTION PLAN (SOFT DELETE)
export const deletePlan = async (req: Request, res: Response) => {
  try {
    const planId = Number(req.params.id);

    if (isNaN(planId)) {
      return sendError(res, "Invalid subscription plan ID", HttpStatus.BAD_REQUEST);
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId, isDeleted: false },
    });

    if (!plan) {
      return sendError(res, "Subscription plan not found", HttpStatus.NOT_FOUND);
    }

    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        isActive: false,
      },
    });

    sendSuccess(
      res,
      null,
      "Subscription plan deleted successfully",
      HttpStatus.OK
    );
  } catch (error: any) {
    console.error("Delete plan error:", error);
    sendError(
      res,
      error?.message || "Failed to delete subscription plan",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};
