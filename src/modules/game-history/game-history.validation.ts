import Joi from 'joi';

// Create game history validation
export const createGameHistorySchema = Joi.object({
  state_id: Joi.number().integer().positive().required().messages({
    'number.base': 'State ID must be a number',
    'number.integer': 'State ID must be an integer',
    'number.positive': 'State ID must be positive',
    'any.required': 'State ID is required',
  }),
  game_id: Joi.number().integer().positive().required().messages({
    'number.base': 'Game ID must be a number',
    'number.integer': 'Game ID must be an integer',
    'number.positive': 'Game ID must be positive',
    'any.required': 'Game ID is required',
  }),
  draw_date: Joi.date().required().messages({
    'date.base': 'Draw date must be a valid date',
    'any.required': 'Draw date is required',
  }),
  draw_time: Joi.string().valid('MID', 'EVE').required().messages({
    'any.only': 'Draw time must be either MID or EVE',
    'any.required': 'Draw time is required',
  }),
  winning_numbers: Joi.string().trim().required().messages({
    'string.base': 'Winning numbers must be a string',
    'any.required': 'Winning numbers is required',
  }),
  // COMMENTED OUT: Result Status flow
  // result: Joi.string().valid('WIN', 'LOSS', 'PENDING').default('PENDING').messages({
  //   'any.only': 'Result must be WIN, LOSS, or PENDING',
  // }),
  prize_amount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .allow(null)
    .messages({
      'number.base': 'Prize amount must be a number',
      'number.min': 'Prize amount cannot be negative',
    }),
});

// Update game history validation
export const updateGameHistorySchema = Joi.object({
  state_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'State ID must be a number',
    'number.integer': 'State ID must be an integer',
    'number.positive': 'State ID must be positive',
  }),
  game_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'Game ID must be a number',
    'number.integer': 'Game ID must be an integer',
    'number.positive': 'Game ID must be positive',
  }),
  draw_date: Joi.date().optional().messages({
    'date.base': 'Draw date must be a valid date',
  }),
  draw_time: Joi.string().valid('MID', 'EVE').optional().messages({
    'any.only': 'Draw time must be either MID or EVE',
  }),
  winning_numbers: Joi.string().trim().optional().messages({
    'string.base': 'Winning numbers must be a string',
  }),
  // COMMENTED OUT: Result Status flow
  // result: Joi.string().valid('WIN', 'LOSS', 'PENDING').optional().messages({
  //   'any.only': 'Result must be WIN, LOSS, or PENDING',
  // }),
  prize_amount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .allow(null)
    .messages({
      'number.base': 'Prize amount must be a number',
      'number.min': 'Prize amount cannot be negative',
    }),
});

// Query parameters validation for GET /api/game-histories
export const getGameHistoriesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    'number.base': 'Page must be a number',
    'number.integer': 'Page must be an integer',
    'number.min': 'Page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).optional().default(10).messages({
    'number.base': 'Limit must be a number',
    'number.integer': 'Limit must be an integer',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit must not exceed 100',
  }),
  search: Joi.string().trim().optional().messages({
    'string.base': 'Search must be a string',
  }),
  // COMMENTED OUT: Result Status flow
  // result: Joi.string().valid('WIN', 'LOSS', 'PENDING').optional().messages({
  //   'any.only': 'Result filter must be WIN, LOSS, or PENDING',
  // }),
  fromDate: Joi.date().optional().messages({
    'date.base': 'From date must be a valid date',
  }),
  toDate: Joi.date().optional().messages({
    'date.base': 'To date must be a valid date',
  }),
  sortBy: Joi.string().valid('drawDate', /* 'resultStatus', */ 'createdAt').optional().default('drawDate').messages({
    'any.only': 'Sort by must be drawDate or createdAt',
  }),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc').messages({
    'any.only': 'Sort order must be asc or desc',
  }),
});
