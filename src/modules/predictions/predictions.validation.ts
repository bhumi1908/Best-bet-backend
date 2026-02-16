import Joi from 'joi';

// Query validation for getLatestPredictions
export const getLatestPredictionsQuerySchema = Joi.object({
  gameId: Joi.number().integer().valid(1, 2).optional().messages({
    'number.base': 'Game ID must be a number',
    'number.integer': 'Game ID must be an integer',
    'any.only': 'Game ID must be either 1 or 2',
  }),
});

// Params validation for getPredictionsStatus
export const getPredictionsStatusParamsSchema = Joi.object({
  jobId: Joi.string().required().messages({
    'string.base': 'Job ID must be a string',
    'any.required': 'Job ID is required',
  }),
});
