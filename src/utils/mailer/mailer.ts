const nodemailer = require("nodemailer");

export const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: true, // use SSL
    auth: {
        user: process.env.EMIAL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
