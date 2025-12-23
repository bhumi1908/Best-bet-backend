import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
}

export const errorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default error
  let statusCode = 500;
  let status = 'error';
  let message = 'Internal server error';

  // Handle known error types
  if (err instanceof Error) {
    message = err.message;

    if ('statusCode' in err && err.statusCode) {
      statusCode = err.statusCode;
    }

    if ('status' in err && err.status) {
      status = err.status;
    }
  }

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  // Send error response
  res.status(statusCode).json({
    status,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const createError = (
  message: string,
  statusCode: number = 500,
  status: string = 'error'
): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.status = status;
  return error;
};

