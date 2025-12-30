import { Request, Response } from "express";
import HttpStatus from "http-status-codes";
import prisma from "../../../config/prisma";
import { sendError, sendSuccess } from "../../../utils/helpers";
import stripe from "../../../config/stripe";

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
  let stripeProductId: string | null = null;
  let stripePriceId: string | null = null;
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

    const product = await stripe.products.create({
      name,
      description: description || "",
      active: isActive,
    });
    stripeProductId = product.id

    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(price * 100),
      currency: "usd",
      recurring: {
        interval: "month",
        interval_count: duration,
      },
      active: isActive,
    });
    stripePriceId = stripePrice.id

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        price,
        duration,
        description,
        isRecommended,
        isActive,

        stripeProductId: product.id,
        stripePriceId: stripePrice.id,

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

    try {
      if (stripeProductId) {
        //  Deactivate all prices
        const prices = await stripe.prices.list({
          product: stripeProductId,
          limit: 100,
        });

        for (const price of prices.data) {
          if (price.active) {
            await stripe.prices.update(price.id, { active: false });
          }
        }

        // Deactivate product
        await stripe.products.update(stripeProductId, {
          active: false,
          metadata: {
            orphaned: "true",
            rollback_reason: "db_failed",
          },
        });
      }
    } catch (stripeError) {
      console.error("Stripe rollback failed:", stripeError);
    }

    return sendError(
      res,
      error?.message || "Failed to create subscription plan",
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

};

//  UPDATE SUBSCRIPTION PLAN
export const updatePlan = async (req: Request, res: Response) => {

  let stripePriceId: string | null = null;
  let stripeProductId: string | null = null;
  let newStripePriceCreated = false;

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
      features = []
    } = req.body;


    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: planId }
    });

    if (!plan || plan.isDeleted) {
      return sendError(res, "Subscription plan not found", HttpStatus.NOT_FOUND);
    }

    const existingNameConflict = await prisma.subscriptionPlan.findFirst({
      where: {
        name,
        isDeleted: false,
        NOT: { id: planId },
      },
    });

    if (existingNameConflict) {
      return sendError(
        res,
        "Another active subscription plan with this name already exists",
        HttpStatus.CONFLICT
      );
    }

    if (plan.stripeProductId) {
      await stripe.products.update(plan.stripeProductId, {
        name,
        description: description || "",
        active: isActive,
      });
    }
    stripePriceId = plan.stripePriceId;

    if (price !== plan.price || duration !== plan.duration) {
      const newPrice = await stripe.prices.create({
        product: plan.stripeProductId!,
        unit_amount: Math.round(price * 100),
        currency: "usd",
        recurring: {
          interval: "month",
          interval_count: duration,
        },
        active: isActive,

      });
      stripePriceId = newPrice.id;
      newStripePriceCreated = true;
    }
    stripeProductId = plan.stripeProductId

    const incomingIds = features.filter((f: any) => f.id).map((f: any) => f.id);

    await prisma.$transaction([
      //  Update plan fields
      prisma.subscriptionPlan.update({
        where: { id: planId },
        data: {
          name,
          price,
          duration,
          description,
          isRecommended,
          isActive,
          stripePriceId
        },
      }),

      //  Delete removed features
      prisma.feature.deleteMany({
        where: {
          planId,
          id: { notIn: incomingIds },
        },
      }),

      // Update existing features
      ...features
        .filter((f: any) => f.id)
        .map((f: any) =>
          prisma.feature.update({
            where: { id: f.id },
            data: {
              name: f.name,
              description: f.description,
            },
          })
        ),

      // Create new features
      prisma.feature.createMany({
        data: features
          .filter((f: any) => !f.id)
          .map((f: any) => ({
            planId,
            name: f.name,
            description: f.description,
          })),
      }),
    ]);

    const updatedPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        features: {
          select: { id: true, name: true, description: true },
        },
      },
    });

    sendSuccess(
      res,
      { plan: updatedPlan },
      "Subscription plan updated successfully",
      HttpStatus.OK
    );
  } catch (error: any) {

    try {
      if (newStripePriceCreated && stripePriceId && stripeProductId) {
        // Deactivate the new price
        await stripe.prices.update(stripePriceId, { active: false });

        if (!req.body.isActive) {
          await stripe.products.update(stripeProductId, {
            active: false,
            metadata: { rollback: "true", reason: "db_failed" },
          });
        }
      }
    } catch (stripeError) {
      console.error("Stripe rollback failed:", stripeError);
    }

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
