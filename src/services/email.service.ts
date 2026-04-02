import nodemailer from 'nodemailer';
import { AdminSettings } from '../models/adminSettings.model';

export const sendRegistrationOTP = async (email: string, otp: string) => {
    // Dynamically retrieve SMTP settings from the DB
    const settings = await AdminSettings.findOne().lean();
    const smtpConfig = (settings as any)?.smtp;

    if (!smtpConfig || !smtpConfig.host || !smtpConfig.user) {
        throw new Error('SMTP Configuration is missing or disabled in Admin Settings');
    }

    const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
        },
    });

    const mailOptions = {
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject: 'TallyPadi - Verify Your Registration',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h2 style="color: #059669;">Welcome to TallyPadi!</h2>
                <p>Hello,</p>
                <p>Thank you for registering. To complete your account creation, please enter the following 6-digit verification code:</p>
                
                <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                    <h1 style="margin: 0; font-size: 32px; letter-spacing: 5px; color: #1f2937;">${otp}</h1>
                </div>
                
                <p>This code will expire in 10 minutes.</p>
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">If you did not request this code, please ignore this email.</p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email OTP sent successfully to ${email} (MessageId: ${info.messageId})`);
        return true;
    } catch (error) {
        console.error('Failed to send OTP email via NodeMailer:', error);
        throw error;
    }
};

export const sendBroadcastEmail = async (email: string, subject: string, htmlBody: string) => {
    const settings = await AdminSettings.findOne().lean();
    const smtpConfig = (settings as any)?.smtp;

    if (!smtpConfig || !smtpConfig.host || !smtpConfig.user) {
        throw new Error('SMTP Configuration is missing or disabled in Admin Settings');
    }

    const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
        },
    });

    const mailOptions = {
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject: subject,
        html: htmlBody
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error(`Failed to send Broadcast Email to ${email}:`, error);
        throw error;
    }
};
