import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwt';

const ENCRYPTED_PREFIX = 'enc:v1:';

const encryptionKey = () => crypto
  .createHash('sha256')
  .update(process.env.SMTP_ENCRYPTION_KEY || getJwtSecret())
  .digest();

export const encryptEmailCredential = (credential: string) => {
  if (!credential || credential.startsWith(ENCRYPTED_PREFIX)) return credential;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
};

export const decryptEmailCredential = (stored: string) => {
  if (!stored?.startsWith(ENCRYPTED_PREFIX)) return stored;
  const [ivPart, tagPart, encryptedPart] = stored.slice(ENCRYPTED_PREFIX.length).split('.');
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('Invalid encrypted email credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

export const encryptSmtpPassword = encryptEmailCredential;
export const decryptSmtpPassword = decryptEmailCredential;

export const createUnsubscribeToken = (email: string) => jwt.sign(
  { purpose: 'email-unsubscribe', email: email.trim().toLowerCase() },
  getJwtSecret(),
  { expiresIn: '365d' }
);

export const verifyUnsubscribeToken = (token: string) => {
  const payload = jwt.verify(token, getJwtSecret()) as { purpose?: string; email?: string };
  if (payload.purpose !== 'email-unsubscribe' || !payload.email) throw new Error('Invalid unsubscribe token');
  return payload.email.trim().toLowerCase();
};
