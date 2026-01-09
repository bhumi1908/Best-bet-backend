import Joi from 'joi';
import { UserRole } from '../../../utils/constants/enums';

// Update user Validation
export const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).optional().messages({
    'string.min': 'First name must be at least 2 characters long',
    'string.max': 'First name must not exceed 50 characters',
  }),
  lastName: Joi.string().trim().min(2).max(50).optional().messages({
    'string.min': 'Last name must be at least 2 characters long',
    'string.max': 'Last name must not exceed 50 characters',
  }),
  phoneNo: Joi.string().trim().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
  stateId: Joi.number().integer().positive().optional().messages({
    'number.base': 'State ID must be a number',
    'number.integer': 'State ID must be an integer',
    'number.positive': 'State ID must be positive',
  }),
  role: Joi.string()
    .valid(UserRole.USER, UserRole.ADMIN)
    .optional()
    .messages({
      'any.only': 'Role must be either USER or ADMIN',
    }),
  isInactive: Joi.boolean().optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

// Get users query Validation
export const getUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(5),
  role: Joi.string().valid(UserRole.USER, UserRole.ADMIN).optional(),
  isInactive: Joi.boolean().optional(),
  search: Joi.string().trim().optional(),
  sortBy: Joi.string()
    .valid('id', 'email', 'firstName', 'lastName', 'role', 'createdAt', 'updatedAt')
    .optional()
    .default('createdAt')
    .messages({
      'any.only': 'sortBy must be one of: id, email, firstName, lastName, role, createdAt, updatedAt',
    }),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .optional()
    .default('desc')
    .messages({
      'any.only': 'sortOrder must be either "asc" or "desc"',
    }),
});

