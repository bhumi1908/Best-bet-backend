import Joi from "joi";


export const createPlanSchema = Joi.object({
  name: Joi.string().trim().required(),
  price: Joi.number().positive().required().optional(),
  duration: Joi.number().integer().positive().optional(),
  trialDays: Joi.number().integer().min(1).optional(),
  description: Joi.string().allow(null, ""),
  isRecommended: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
   discountPercent: Joi.number().min(0).max(100).optional(),
  features: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().allow(null, ""),
      })
    )
    .optional(),
});

export const updatePlanSchema = Joi.object({
  name: Joi.string().trim().optional(),
  price: Joi.number().positive().optional(),
   trialDays: Joi.number().integer().min(1).optional(), 
  duration: Joi.number().integer().positive().optional(),
  description: Joi.string().allow(null, ""),
  isRecommended: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
   discountPercent: Joi.number().min(0).max(100).optional(),
  features: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().allow(null, ""),
      })
    )
    .optional(),
}).min(1);
