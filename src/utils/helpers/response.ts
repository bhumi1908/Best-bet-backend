import { Response } from 'express';
import { HttpStatus } from '../constants/enums';

export const sendSuccess = (
  res: Response,
  data: any,
  message: string = 'Success',
  statusCode: number = HttpStatus.OK
): void => {
  res.status(statusCode).json({
    status: 'success',
    message,
    data,
  });
};


export const sendError = (
  res: Response,
  message: string,
  statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
  errors?: any[]
): void => {

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(errors && { errors }),
  });
};


