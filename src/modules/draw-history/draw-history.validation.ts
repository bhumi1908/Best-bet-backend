import Joi from 'joi';

// Query parameters validation for GET /api/draw-history (public endpoint)
export const getDrawHistoriesQuerySchema = Joi.object({
  search: Joi.string().trim().optional().messages({
    'string.base': 'Search must be a string',
  }),
  stateId: Joi.number().integer().positive().optional().messages({
    'number.base': 'State ID must be a number',
    'number.integer': 'State ID must be an integer',
    'number.positive': 'State ID must be positive',
  }),
  drawTime: Joi.string().trim().optional().messages({
    'string.base': 'Draw time must be a string',
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
