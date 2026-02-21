import { env } from './env';

export const getJwtSecret = () => {
  const s = process.env.JWT_SECRET || (env as { jwtSecret?: string }).jwtSecret;
  if (!s) throw new Error('JWT_SECRET missing');
  return s;
};
