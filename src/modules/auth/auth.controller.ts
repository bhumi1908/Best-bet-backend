import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma';
import { sendSuccess, sendError } from '../../utils/helpers/response';
import { HttpStatus, UserRole } from '../../utils/constants/enums';
import { JWTPayload } from '../../middleware/auth';
import crypto from 'crypto';
import { clearAccessToken, clearRefreshToken, setAccessToken, setRefreshToken } from '../../utils/helpers';
import { transporter } from '../../utils/mailer/mailer';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;


// User Register 
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phoneNo, role } = req.body;
    console.log('req.body', req.body)

    // Validate input
    if (!email || !password || !firstName || !lastName || !phoneNo) {
      sendError(res, 'Email, password, first name, last name, and phone number are required', HttpStatus.BAD_REQUEST);
      return;
    }

    // Check if user already exists by email
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      sendError(res, 'User with this email already exists', HttpStatus.BAD_REQUEST);
      return;
    }

    // Check if phone number already exists
    const existingPhone = await prisma.user.findFirst({
      where: { phoneNo },
      select: { id: true },
    });

    if (existingPhone) {
      sendError(res, 'User with this phone number already exists', HttpStatus.BAD_REQUEST);
      return;
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user using Prisma
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName,
        lastName: lastName,
        phoneNo: phoneNo,
        role: role ?? UserRole.USER,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNo: true,
        role: true,
      },
    });

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNo: user.phoneNo,
          role: user.role,
        },
      },
      'User registered successfully',
      HttpStatus.CREATED
    );
  } catch (error: any) {

    if (error?.code === 'P2002') {
      // Check which unique constraint was violated
      if (error.meta?.target?.includes('email')) {
        sendError(res, 'User with this email already exists', HttpStatus.BAD_REQUEST);
      } else if (error.meta?.target?.includes('phone_no')) {
        sendError(res, 'User with this phone number already exists', HttpStatus.BAD_REQUEST);
      } else {
        sendError(res, 'A user with this information already exists', HttpStatus.BAD_REQUEST);
      }
      return;
    }

    // Provide more specific error messages
    if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
      sendError(
        res,
        'Database connection failed. Please check your database configuration and ensure PostgreSQL is running.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to register user',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

// User Login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
      return;
    }

    // Find user by email using Prisma
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        isInactive: true,
        role: true,
        phoneNo:true,
      },
    });
    if (!user) {
      sendError(res, 'Invalid email or password', HttpStatus.UNAUTHORIZED);
      return;
    }

    if (user.isInactive) {
      sendError(res, 'Your account is inactive. Contact to support team.', HttpStatus.FORBIDDEN);
      return
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      sendError(res, 'Invalid email or password', HttpStatus.UNAUTHORIZED);
      return;
    }

    if (!JWT_SECRET || !REFRESH_TOKEN_SECRET) {
      sendError(res, 'Server configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    // Generate Access Token (short-lived)
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role } as JWTPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Generate Refresh Token (long-lived, secure random string)
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role } as JWTPayload,
      REFRESH_TOKEN_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions
    );

    // Set cookies
    setAccessToken(res, accessToken);
    setRefreshToken(res, refreshToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          phoneNo: user.phoneNo
        },
        token: {
          accessToken,
          refreshToken
        }
      },
      'Login successful'
    );
  } catch (error: any) {

    // Provide more specific error messages
    if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
      sendError(
        res,
        'Database connection failed. Please check your database configuration and ensure PostgreSQL is running.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
      return;
    }

    sendError(
      res,
      error?.message || 'Failed to login',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

//Refresh Token
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get refresh token from body or cookie
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      sendError(res, "Unauthorized", HttpStatus.UNAUTHORIZED);
      return;
    }
    const removeBearer = authHeader.split(" ")[1];
    const token = req.cookies.refreshToken || removeBearer;

    if (!token) {
      sendError(res, 'Unauthorized', HttpStatus.UNAUTHORIZED);
      return;
    }

    if (!JWT_SECRET || !REFRESH_TOKEN_SECRET) {
      throw new Error('JWT secrets are not configured');
    }


    // Verify refresh token
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, REFRESH_TOKEN_SECRET) as unknown as JWTPayload;
    } catch (err) {
      sendError(res, 'Invalid or expired refresh token', HttpStatus.FORBIDDEN);
      return;

    }

    // Check if refresh token exists in DB
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, refreshToken: true },
    });

    if (!user || user.refreshToken !== token) {
      sendError(res, 'Refresh token not found or revoked', HttpStatus.FORBIDDEN);
      return;

    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role } as JWTPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );


    setAccessToken(res, newAccessToken);

    // Send new tokens (include accessToken in response for frontend to update session)
    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        accessToken: newAccessToken, // Return access token in response
      },
      'Token refreshed successfully'
    );

  } catch (error: any) {
    sendError(
      res,
      error?.message || 'Failed to refresh token',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      sendError(res, 'Email not found', HttpStatus.NOT_FOUND);
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}&id=${user.id}`;

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const hashedToken = await bcrypt.hash(resetToken, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        forgotHashKey: hashedToken,
        forgotHashExpiresAt: expiresAt,
      },
    });

    // Read HTML template from external file
    const templatePath = path.join(process.cwd(), 'src/templates/emails', 'forgot-password.html');
    let emailHtml = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders with actual values
    emailHtml = emailHtml
      .replace('{{name}}', `${user.firstName} ${user.lastName}`)
      .replace('{{resetUrl}}', resetUrl)
      .replace(/\$\{firstName\}/g, user.firstName || 'there')
      .replace(/\$\{resetLink\}/g, resetUrl)
      .replace(/\$\{expiryTime\}/g, '15 minutes')

    // Email content
    const mailOptions = {
      from: `"${process.env.EMAIL_USER}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Reset Your Password",
      text: `Hello ${user.firstName + ' ' + user.lastName},\n\nClick the link below to reset your password. This link will expire in 15 minutes.\n\n${resetUrl}`,
      html: emailHtml,
      attachments: [
        {
          filename: 'lock.png',
          path: path.join(process.cwd(), '/public/assests/lock-image.png'),
          cid: 'lockIcon'
        },
        {
          filename: 'info.png',
          path: path.join(process.cwd(), '/public/assests/Info-image.png'),
          cid: 'InfoIcon'
        },
        {
          filename: 'shield.png',
          path: path.join(process.cwd(), '/public/assests/shield-image.png'),
          cid: 'ShieldIcon'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    sendSuccess(res, null, 'Password reset email sent');
    return;
  } catch (error) {
    sendError(res, 'Failed to send password reset email', 500);
    return;
  }
};

export const resetPassword = async (req: Request, res: Response) => {

  const { hash, password } = req.body;

  if (!hash || !password) {
    sendError(
      res,
      'Reset token and password are required',
      HttpStatus.BAD_REQUEST
    );
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      forgotHashExpiresAt: { gte: new Date() }, // Not expired
    },
  });

  if (!user) {
    sendError(res, 'The password reset link is invalid or has expired. Please request a new one.', HttpStatus.BAD_REQUEST);
    return;
  }

  const isValid = user.forgotHashKey && await bcrypt.compare(hash, user.forgotHashKey);
  if (!isValid) {
    sendError(res, 'The password reset link is invalid or has expired. Please request a new one.', HttpStatus.BAD_REQUEST);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      forgotHashKey: null,
      forgotHashExpiresAt: null,
    },
  });

  sendSuccess(res, null, 'Password has been reset successfully');
};


//Logout User
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (userId) {
      // Optional: Clear refresh token from database if you store it
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
    }

    // Clear refresh token cookie
    clearRefreshToken(res);
    clearAccessToken(res)

    sendSuccess(res, null, 'Logged out successfully', HttpStatus.OK);
  } catch (error) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Failed to logout',
    });
  }
};