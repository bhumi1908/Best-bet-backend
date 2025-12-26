import Joi from "joi";

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .trim()
    .required()
    .messages({
      "string.base": "Current password must be a string",
      "string.empty": "Current password is required",
      "any.required": "Current password is required",
    }),

  newPassword: Joi.string()
    .trim()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required()
    .messages({
      "string.base": "New password must be a string",
      "string.empty": "New password is required",
      "string.min": "New password must be at least 8 characters long",
      "string.pattern.base":
        "New password must include uppercase, lowercase, number, and special character",
      "any.required": "New password is required",
    }),
});
