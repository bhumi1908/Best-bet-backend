import Joi from "joi";


export const createPlanSchema = Joi.object({
  name: Joi.string().trim().required(),
  price: Joi.number().positive().required(),
  duration: Joi.number().integer().positive().required(),
  description: Joi.string().allow(null, ""),
  isRecommended: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
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
  duration: Joi.number().integer().positive().optional(),
  description: Joi.string().allow(null, ""),
  isRecommended: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
}).min(1);
