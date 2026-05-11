import nodemailer from 'nodemailer';
import { AdminSettings } from '../models/adminSettings.model';

const escapeHtml = (value: unknown) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

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

export const sendSellerVerificationAdminNotification = async ({
    verificationId,
    fullName,
    businessName,
    phoneNumber,
    email,
    countryCode,
    idType,
}: {
    verificationId: string;
    fullName: string;
    businessName?: string;
    phoneNumber?: string;
    email?: string;
    countryCode: string;
    idType: string;
}) => {
    const settings = await AdminSettings.findOne().lean();
    const smtpConfig = (settings as any)?.smtp;

    if (!smtpConfig || !smtpConfig.host || !smtpConfig.user) {
        throw new Error('SMTP Configuration is missing or disabled in Admin Settings');
    }

    const adminEmail = String(process.env.SELLER_VERIFICATION_ADMIN_EMAIL || smtpConfig.fromAddress || smtpConfig.user || '').trim();
    if (!adminEmail) throw new Error('Seller verification admin email is not configured');

    const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
        },
    });

    const safe = {
        verificationId: escapeHtml(verificationId),
        fullName: escapeHtml(fullName),
        businessName: escapeHtml(businessName || 'Not provided'),
        phoneNumber: escapeHtml(phoneNumber || 'Not provided'),
        email: escapeHtml(email || 'Not provided'),
        countryCode: escapeHtml(countryCode),
        idType: escapeHtml(idType),
    };

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: adminEmail,
        subject: `New seller verification: ${fullName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
                <h2 style="margin: 0 0 12px; color: #0284c7;">New seller verification request</h2>
                <p style="color: #475569;">A marketplace seller has submitted identity verification for admin review.</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Verification ID</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${safe.verificationId}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Full name</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${safe.fullName}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Business</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safe.businessName}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safe.phoneNumber}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Email</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safe.email}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Country</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safe.countryCode}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">ID type</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safe.idType}</td></tr>
                </table>
                <p style="margin-top: 20px; color: #64748b; font-size: 13px;">Open the admin dashboard and review this request under marketplace verifications.</p>
            </div>
        `,
    });

    return true;
};

const createSmtpTransport = async () => {
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

    return { transporter, smtpConfig };
};

export const sendSellerVerificationApprovedEmail = async (email: string, fullName: string) => {
    const { transporter, smtpConfig } = await createSmtpTransport();
    const safeName = escapeHtml(fullName || 'Seller');

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject: 'Your TallyPadi seller verification is complete',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
                <h2 style="margin: 0 0 12px; color: #0284c7;">Verification complete</h2>
                <p>Hello ${safeName},</p>
                <p>Your seller identity has been verified. Your marketplace profile and storefront can now show the <strong>Verified ID</strong> badge.</p>
                <p style="color: #64748b; font-size: 13px;">Thank you for helping keep TallyPadi marketplace trusted.</p>
            </div>
        `,
    });

    return true;
};

export const sendSellerReverificationRequestedEmail = async (email: string, fullName: string, reason: string) => {
    const { transporter, smtpConfig } = await createSmtpTransport();
    const safeName = escapeHtml(fullName || 'Seller');
    const safeReason = escapeHtml(reason || 'TallyPadi needs you to complete seller verification again.');

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject: 'Please reverify your TallyPadi seller account',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
                <h2 style="margin: 0 0 12px; color: #0284c7;">Seller reverification required</h2>
                <p>Hello ${safeName},</p>
                <p>TallyPadi admin has requested that you complete seller verification again.</p>
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; color: #991b1b; margin: 16px 0;">
                    ${safeReason}
                </div>
                <p>Please open your Online Store settings and submit verification again.</p>
            </div>
        `,
    });

    return true;
};
