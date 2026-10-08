import crypto from 'crypto';

const RESET_CODE_LENGTH = 6;

const resetSecret = () => {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('PASSWORD_RESET_SECRET or JWT_SECRET is required');
  return secret;
};

export const createPasswordResetCode = () =>
  crypto.randomInt(0, 10 ** RESET_CODE_LENGTH).toString().padStart(RESET_CODE_LENGTH, '0');

export const hashPasswordResetCode = (userId: string, code: string) =>
  crypto
    .createHmac('sha256', resetSecret())
    .update(`${String(userId)}:${String(code)}`)
    .digest('hex');

export const passwordResetCodeMatches = (input: {
  userId: string;
  code: string;
  expectedHash?: string | null;
}) => {
  if (!/^\d{6}$/.test(String(input.code || '')) || !input.expectedHash) return false;

  const actual = Buffer.from(hashPasswordResetCode(input.userId, input.code), 'hex');
  const expected = Buffer.from(String(input.expectedHash), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

export const validateResetPassword = (password: unknown) => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
};
