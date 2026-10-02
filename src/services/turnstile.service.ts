import axios from 'axios';
import { env } from '../config/env';

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

export type TurnstileVerification = {
  success: boolean;
  reason?: 'NOT_CONFIGURED' | 'REJECTED' | 'UNAVAILABLE';
};

export const verifyTurnstileToken = async (
  token: string,
  remoteIp?: string
): Promise<TurnstileVerification> => {
  const secret = String(env.turnstileSecretKey || '').trim();
  if (!secret) return { success: false, reason: 'NOT_CONFIGURED' };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const response = await axios.post<TurnstileResponse>(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      body.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 8000,
      }
    );

    const result = response.data;
    const expectedHostname = String(
      env.turnstileExpectedHostname || (process.env.NODE_ENV === 'production' ? 'tallypadi.com' : '')
    ).trim().toLowerCase();
    const hostnameMatches = !expectedHostname || String(result.hostname || '').toLowerCase() === expectedHostname;
    const isCloudflareTestSecret = secret === '1x0000000000000000000000000000000AA';
    const actionMatches = isCloudflareTestSecret || result.action === 'support_ticket';

    if (result.success && hostnameMatches && actionMatches) return { success: true };

    console.warn('Turnstile rejected support ticket submission:', {
      errors: result['error-codes'] || [],
      hostnameMatches,
      actionMatches,
    });
    return { success: false, reason: 'REJECTED' };
  } catch (error) {
    console.error('Turnstile verification unavailable:', error instanceof Error ? error.message : error);
    return { success: false, reason: 'UNAVAILABLE' };
  }
};
