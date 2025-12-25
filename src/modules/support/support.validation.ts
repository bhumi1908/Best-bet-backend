import Joi from 'joi';

export const createSupportSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.base': 'Name must be a string',
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 100 characters',
    }),

  email: Joi.string().email().trim().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),

  subject: Joi.string()
    .trim()
    .min(5)
    .max(150)
    .required()
    .messages({
      'string.empty': 'Subject is required',
      'string.min': 'Subject must be at least 5 characters long',
      'string.max': 'Subject must not exceed 150 characters',
    }),

  category: Joi.string()
    .trim()
    .required()
    .messages({
      'string.empty': 'Please select a category',
    }),

  priority: Joi.string()
    .trim()
    .required()
    .messages({
      'string.empty': 'Please select a priority',
    }),

  message: Joi.string()
    .trim()
    .min(10)
    .max(2000)
    .required()
    .messages({
      'string.empty': 'Message is required',
      'string.min': 'Message must be at least 10 characters long',
      'string.max': 'Message must not exceed 2000 characters',
    }),
});
