import { Request, Response } from 'express';
import prisma from '../../config/prisma';
import { HttpStatus } from '../../utils/constants/enums';
import { sendError, sendSuccess } from '../../utils/helpers';
import fs from 'fs';
import path from 'path';
import { transporter } from '../../utils/mailer/mailer';

/**
 * Create Support Ticket
 */
export const createSupport = async (req: Request, res: Response): Promise<void> => {
    try {

        const { name, email, subject, category, priority, message } = req.body;

        // Extra safety check (optional, middleware already validates)
        if (!name || !email || !subject || !category || !priority || !message) {
            sendError(res, 'All fields are required', HttpStatus.BAD_REQUEST);
            return;
        }

        const supportTicket = await prisma.support.create({
            data: {
                name,
                email,
                subject,
                category,
                priority,
                message,
            },
            select: {
                id: true,
                email: true,
                subject: true,
                category: true,
                priority: true,
                message: true,
            },
        });

        const templatePath = path.join(
            process.cwd(),
            'src/templates/emails',
            'support-request.html'
        );
        let emailHtml = fs.readFileSync(templatePath, 'utf-8');
        emailHtml = emailHtml
            .replace(/\$\{fullName\}/g, name)
            .replace(/\$\{email\}/g, email)
            .replace(/\$\{subject\}/g, subject)
            .replace(/\$\{category\}/g, category)
            .replace(/\$\{Priority\}/g, priority)
            .replace(/\$\{message\}/g, message)
            .replace(/\$\{timeStpm\}/g, new Date().toLocaleString());

        await transporter.sendMail({
            from: `"${process.env.EMAIL_USER}" <${process.env.EMAIL_USER}>`,
            to: process.env.SUPPORT_RECEIVER,
            subject: `New Support Request - ${subject}`,
            html: emailHtml,
            attachments: [
                {
                    filename: 'message.png',
                    path: path.join(process.cwd(), '/public/assests/message-image.png'),
                    cid: 'MessageIcon'
                },
                {
                    filename: 'info.png',
                    path: path.join(process.cwd(), '/public/assests/Info-image.png'),
                    cid: 'InfoIcon'
                },
                {
                    filename: 'clock.png',
                    path: path.join(process.cwd(), '/public/assests/clock-image.png'),
                    cid: 'ClockIcon'
                },
                {
                    filename: 'user.png',
                    path: path.join(process.cwd(), '/public/assests/user-image.png'),
                    cid: 'UserIcon'
                },
                {
                    filename: 'mail.png',
                    path: path.join(process.cwd(), '/public/assests/mail-image.png'),
                    cid: 'MailIcon'
                },
                {
                    filename: 'messageBlack.png',
                    path: path.join(process.cwd(), '/public/assests/message-black-image.png'),
                    cid: 'MessageBlackIcon'
                },
            ]
        });

        sendSuccess(res, { ticket: supportTicket }, 'Support ticket created successfully', HttpStatus.CREATED);
    } catch (error: any) {
        console.error('Create support error:', error);

        if (error?.code === 'P2002') {
            sendError(
                res,
                'Support ticket already exists',
                HttpStatus.BAD_REQUEST
            );
            return;
        }

        // Database connection issues
        if (error?.code === 'ECONNREFUSED' || error?.code === 'P1001') {
            sendError(
                res,
                'Database connection failed. Please try again later.',
                HttpStatus.SERVICE_UNAVAILABLE
            );
            return;
        }

        sendError(
            res,
            error?.message || 'Failed to create support ticket',
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};
