import Joi from 'joi';

// Register user Validation
export const registerSchema = Joi.object({
  email: Joi.string().email().trim().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must include uppercase, lowercase, number, and special character',
      'any.required': 'Password is required',
    }),
  firstName: Joi.string().trim().min(2).max(50).required().messages({
    'string.min': 'First name must be at least 2 characters long',
    'string.max': 'First name must not exceed 50 characters',
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().trim().min(2).max(50).required().messages({
    'string.min': 'Last name must be at least 2 characters long',
    'string.max': 'Last name must not exceed 50 characters',
    'any.required': 'Last name is required',
  }),
  phoneNo: Joi.string().trim().pattern(/^\+?[1-9]\d{0,2}[\s.-]?\(?\d{1,4}\)?([\s.-]?\d{2,4}){2,4}$/).required().messages({
    'string.pattern.base': 'Please provide a valid phone number',
    'any.required': 'Phone number is required',
  }),
  stateId: Joi.number().integer().positive().required().messages({
    'number.base': 'State is required',
    'number.integer': 'State ID must be an integer',
    'number.positive': 'State ID must be positive',
    'any.required': 'State is required',
  }),
  role: Joi.string()
    .valid("USER", "ADMIN")
    .optional()
    .messages({
      "any.only": "Role must be either USER or ADMIN",
    }),
});

// Login user Validation
export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});


// Forgot password validation
export const forgotPassSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
})

//Reset password validation
export const resetPasswordSchema = Joi.object({
  hash: Joi.string().required().messages({
    'string.base': 'Reset token is required',
    'any.required': 'Reset token is required',
  }),
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must include uppercase, lowercase, number, and special character',
      'any.required': 'Password is required',
    }),
});