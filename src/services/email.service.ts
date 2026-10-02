import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { AdminSettings } from '../models/adminSettings.model';
import { createUnsubscribeToken, decryptSmtpPassword, encryptSmtpPassword } from './emailSecurity.service';

type SmtpConfig = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromAddress?: string;
};

let cachedTransport: { key: string; transporter: nodemailer.Transporter; smtpConfig: SmtpConfig } | null = null;

export const invalidateSmtpTransport = () => {
    cachedTransport?.transporter.close();
    cachedTransport = null;
};

const createSmtpTransport = async () => {
    const settings = await AdminSettings.findOne().select('+smtp.pass').lean();
    const stored = (settings as any)?.smtp;
    if (!stored?.host || !stored?.user || !stored?.pass) {
        throw new Error('SMTP Configuration is missing or disabled in Admin Settings');
    }

    if (!String(stored.pass).startsWith('enc:v1:')) {
        await AdminSettings.updateOne({ _id: (settings as any)._id }, { $set: { 'smtp.pass': encryptSmtpPassword(String(stored.pass)) } });
    }

    const smtpConfig: SmtpConfig = {
        host: String(stored.host).trim(),
        port: Number(stored.port) || 587,
        secure: Boolean(stored.secure),
        user: String(stored.user).trim(),
        pass: decryptSmtpPassword(String(stored.pass)),
        fromAddress: String(stored.fromAddress || stored.user).trim(),
    };
    const key = JSON.stringify(smtpConfig);
    if (cachedTransport?.key === key) return cachedTransport;

    invalidateSmtpTransport();
    const transporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 2,
        maxMessages: 100,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    });
    cachedTransport = { key, transporter, smtpConfig };
    return cachedTransport;
};

const escapeHtml = (value: unknown) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const sendRegistrationOTP = async (email: string, otp: string) => {
    // Dynamically retrieve SMTP settings from the DB
    const { transporter, smtpConfig } = await createSmtpTransport();

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

export const sendBroadcastEmail = async (
    email: string,
    subject: string,
    htmlBody: string,
    unsubscribeUrl: string
) => {
    const { transporter, smtpConfig } = await createSmtpTransport();

    const mailOptions = {
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject: subject,
        html: htmlBody,
        headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error(`Failed to send Broadcast Email to ${email}:`, error);
        throw error;
    }
};

export const sendAdminPersonalEmail = async ({
    email,
    subject,
    message,
    name,
    businessName,
    phoneNumber,
}: {
    email: string;
    subject: string;
    message: string;
    name?: string;
    businessName?: string;
    phoneNumber?: string;
}) => {
    const { transporter, smtpConfig } = await createSmtpTransport();
    const settings = await AdminSettings.findOne().lean();
    const replacePersonalFields = (value: string) => value
        .replace(/##usershopname##/g, businessName || 'Your Shop')
        .replace(/##phonenumber##/g, phoneNumber || '')
        .replace(/##name##/g, name || businessName || 'there');
    const replaceHtmlFields = (value: string) => value
        .replace(/##usershopname##/g, escapeHtml(businessName || 'Your Shop'))
        .replace(/##phonenumber##/g, escapeHtml(phoneNumber || ''))
        .replace(/##name##/g, escapeHtml(name || businessName || 'there'));

    const personalizedSubject = replacePersonalFields(subject).slice(0, 160);
    const personalizedMessage = replacePersonalFields(message);
    let html = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.7">${escapeHtml(personalizedMessage)}</div>`;
    const globalTemplate = String(settings?.globalEmailTemplate || '');
    if (/\{\{\s*message\s*\}\}/i.test(globalTemplate)) {
        html = globalTemplate.replace(/\{\{\s*message\s*\}\}/i, html);
    }
    const unsubscribeToken = createUnsubscribeToken(email);
    const apiBaseUrl = String(process.env.API_BASE_URL || 'https://tallypadi.com/api').replace(/\/$/, '');
    const unsubscribeUrl = `${apiBaseUrl}/public/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    html = replaceHtmlFields(html).replace(/\{\{unsubscribe_link\}\}/g, unsubscribeUrl);

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject: personalizedSubject,
        html,
        headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
    });

    return true;
};

export const sendSupportTicketAdminNotification = async ({
    ticketId,
    ticketNumber,
    name,
    email,
    phone,
    category,
    subject,
    message,
}: {
    ticketId: string;
    ticketNumber: string;
    name: string;
    email: string;
    phone?: string;
    category: string;
    subject: string;
    message: string;
}) => {
    const { transporter, smtpConfig } = await createSmtpTransport();
    const settings = await AdminSettings.findOne().lean();
    const adminEmail = String(
        env.supportTicketAdminEmail || smtpConfig.fromAddress || smtpConfig.user || ''
    ).trim();
    if (!adminEmail) throw new Error('Support ticket admin email is not configured');

    const appBaseUrl = String(process.env.APP_BASE_URL || 'https://tallypadi.com').replace(/\/$/, '');
    const ticketUrl = `${appBaseUrl}/admin/tickets?ticket=${encodeURIComponent(ticketId)}`;
    const safe = {
        ticketNumber: escapeHtml(ticketNumber),
        name: escapeHtml(name),
        email: escapeHtml(email),
        phone: escapeHtml(phone || 'Not provided'),
        category: escapeHtml(category),
        subject: escapeHtml(subject),
        message: escapeHtml(message).replace(/\n/g, '<br>'),
        ticketUrl: escapeHtml(ticketUrl),
    };

    const content = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#172033;line-height:1.6">
            <h2 style="margin:0 0 8px;color:#064e3b">New support ticket</h2>
            <p style="margin:0 0 20px;color:#64748b">${safe.ticketNumber}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#64748b;width:120px">From</td><td style="padding:8px 0;font-weight:700">${safe.name}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b">Email</td><td style="padding:8px 0">${safe.email}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b">Phone</td><td style="padding:8px 0">${safe.phone}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b">Category</td><td style="padding:8px 0">${safe.category}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b">Subject</td><td style="padding:8px 0;font-weight:700">${safe.subject}</td></tr>
            </table>
            <div style="margin:20px 0;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">${safe.message}</div>
            <a href="${safe.ticketUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Open ticket</a>
        </div>
    `;

    const globalTemplate = String(settings?.globalEmailTemplate || '');
    let html = /\{\{\s*message\s*\}\}/i.test(globalTemplate)
        ? globalTemplate.replace(/\{\{\s*message\s*\}\}/i, content)
        : content;
    html = html
        .replace(/\{\{unsubscribe_link\}\}/g, safe.ticketUrl)
        .replace(/##usershopname##/g, 'TallyPadi Support')
        .replace(/##phonenumber##/g, safe.phone)
        .replace(/##name##/g, safe.name);

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: adminEmail,
        replyTo: email,
        subject: `[${ticketNumber}] ${subject}`.slice(0, 180),
        html,
    });

    return true;
};

export const sendSubscriptionExpiryEmail = async ({
    email,
    name,
    businessName,
    expiryAt,
    daysBeforeExpiry,
    isTrial,
}: {
    email: string;
    name?: string;
    businessName?: string;
    expiryAt: Date;
    daysBeforeExpiry: 0 | 1 | 2 | 3;
    isTrial: boolean;
}) => {
    const { transporter, smtpConfig } = await createSmtpTransport();
    const safeName = escapeHtml(name || businessName || 'there');
    const safeBusiness = escapeHtml(businessName || 'your shop');
    const expiryDate = escapeHtml(expiryAt.toLocaleDateString('en-NG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Lagos',
    }));
    const accountLabel = isTrial ? 'free trial' : 'subscription';
    const timing = daysBeforeExpiry === 0
        ? `Your TallyPadi ${accountLabel} has expired.`
        : `Your TallyPadi ${accountLabel} expires in ${daysBeforeExpiry} day${daysBeforeExpiry === 1 ? '' : 's'}.`;
    const subject = daysBeforeExpiry === 0
        ? `Your TallyPadi ${accountLabel} has expired`
        : `${daysBeforeExpiry} day${daysBeforeExpiry === 1 ? '' : 's'} left on your TallyPadi ${accountLabel}`;
    const billingUrl = `${String(process.env.APP_BASE_URL || 'https://tallypadi.com').replace(/\/$/, '')}/billing`;

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: email,
        subject,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172033;line-height:1.6">
                <div style="background:#052e2b;color:#fff;padding:22px 24px;border-radius:14px 14px 0 0">
                    <div style="font-size:22px;font-weight:800">TallyPadi</div>
                </div>
                <div style="border:1px solid #dbe5e3;border-top:0;padding:26px 24px;border-radius:0 0 14px 14px">
                    <p>Hello ${safeName},</p>
                    <h2 style="margin:8px 0;color:${daysBeforeExpiry === 0 ? '#b42318' : '#087f5b'}">${timing}</h2>
                    <p><strong>${safeBusiness}</strong> is scheduled through <strong>${expiryDate}</strong>.</p>
                    <p>${daysBeforeExpiry === 0 ? 'Renew now to restore access to your business tools.' : 'Renew early to keep your shop running without interruption.'}</p>
                    <p style="margin:24px 0">
                        <a href="${escapeHtml(billingUrl)}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:700;display:inline-block">Renew subscription</a>
                    </p>
                    <p style="font-size:13px;color:#64748b;margin-top:24px">This is an account service notification from TallyPadi.</p>
                </div>
            </div>
        `,
    });

    return true;
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
    const { transporter, smtpConfig } = await createSmtpTransport();

    const adminEmail = String(process.env.SELLER_VERIFICATION_ADMIN_EMAIL || smtpConfig.fromAddress || smtpConfig.user || '').trim();
    if (!adminEmail) throw new Error('Seller verification admin email is not configured');

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

export const sendAdRejectionAdminNotification = async ({
    campaignId,
    campaignName,
    provider,
    reason,
}: {
    campaignId: string;
    campaignName: string;
    provider: string;
    reason: string;
}) => {
    const { transporter, smtpConfig } = await createSmtpTransport();
    
    // We can pull the admin email from env or fall back to the from address
    const adminEmail = String(process.env.ADMIN_ALERT_EMAIL || smtpConfig.fromAddress || smtpConfig.user || '').trim();
    if (!adminEmail) {
        console.warn('Ad rejection admin email is not configured, skipping notification.');
        return false;
    }

    const safe = {
        campaignId: escapeHtml(campaignId),
        campaignName: escapeHtml(campaignName),
        provider: escapeHtml(provider),
        reason: escapeHtml(reason),
    };

    await transporter.sendMail({
        from: `TallyPadi <${smtpConfig.fromAddress || smtpConfig.user}>`,
        to: adminEmail,
        subject: `Ad Campaign Rejected by ${safe.provider}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
                <h2 style="margin: 0 0 12px; color: #dc2626;">Ad Campaign Rejected</h2>
                <p style="color: #475569;">An automated ad campaign was rejected by the provider's reviewers.</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Campaign ID</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${safe.campaignId}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Campaign Name</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">${safe.campaignName}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Provider</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safe.provider}</td></tr>
                </table>
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; color: #991b1b; margin: 16px 0;">
                    <strong>Reason given:</strong><br/>
                    ${safe.reason}
                </div>
                <p style="margin-top: 20px; color: #64748b; font-size: 13px;">The system has automatically updated the campaign status and refunded the merchant's wallet.</p>
            </div>
        `,
    });

    return true;
};
