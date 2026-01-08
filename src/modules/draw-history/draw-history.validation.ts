import Joi from 'joi';

// Query parameters validation for GET /api/draw-history (public endpoint)
export const getDrawHistoriesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    'number.base': 'Page must be a number',
    'number.integer': 'Page must be an integer',
    'number.min': 'Page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).optional().default(16).messages({
    'number.base': 'Limit must be a number',
    'number.integer': 'Limit must be an integer',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit must not exceed 100',
  }),
  search: Joi.string().trim().optional().messages({
    'string.base': 'Search must be a string',
  }),
  stateId: Joi.number().integer().positive().optional().messages({
    'number.base': 'State ID must be a number',
    'number.integer': 'State ID must be an integer',
    'number.positive': 'State ID must be positive',
  }),
  fromDate: Joi.date().optional().messages({
    'date.base': 'From date must be a valid date',
  }),
  toDate: Joi.date().optional().messages({
    'date.base': 'To date must be a valid date',
  }),
  sortBy: Joi.string().valid('drawDate', 'winningNumbers').optional().default('drawDate').messages({
    'any.only': 'Sort by must be drawDate or winningNumbers',
  }),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc').messages({
    'any.only': 'Sort order must be asc or desc',
  }),
});
