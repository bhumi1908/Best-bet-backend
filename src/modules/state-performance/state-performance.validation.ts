import Joi from 'joi';

// Query validation for getStatePerformance
export const getStatePerformanceQuerySchema = Joi.object({
  state: Joi.string().required().messages({
    'string.base': 'State must be a string',
    'any.required': 'State parameter is required',
  }),
  gameId: Joi.number().integer().valid(1, 2).optional().messages({
    'number.base': 'Game ID must be a number',
    'number.integer': 'Game ID must be an integer',
    'any.only': 'Game ID must be either 1 or 2',
  }),
});
