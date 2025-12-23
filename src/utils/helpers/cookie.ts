  import { Response } from 'express';

  export const setCookie = (
    res: Response,
    name: string,
    value: string,
    options: {
      maxAge?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'strict' | 'lax' | 'none';
      path?: string;
    } = {}
  ): void => {
    const {
      maxAge = 7 * 24 * 60 * 60 * 1000, // 7 days default
      httpOnly = true,
      secure = process.env.NODE_ENV === 'production',
      sameSite = 'lax',
      path = '/'
    } = options;

    res.cookie(name, value, {
      maxAge,
      httpOnly,
      secure,
      sameSite,
      path
    });
  };

  export const clearCookie = (res: Response, name: string): void => {
    res.clearCookie(name, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:'/'
    });
  };

  export const setRefreshToken = (res: Response, token: string) => {
    setCookie(res, 'refreshToken', token, {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in seconds
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path:'/'
    });
  };


  export const setAccessToken = (res: Response, token: string) => {
    setCookie(res, 'accessToken', token, {
      maxAge: 1 * 60 * 1000, // 15 minutes
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path:'/'
    });
  };


  export const clearRefreshToken = (res: Response) => {
    clearCookie(res, 'refreshToken');
  };
  export const clearAccessToken = (res: Response) => {
    clearCookie(res, 'accessToken');
  };


