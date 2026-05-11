import axios from 'axios';
import { env } from '../../../config/env';

export const majorFromMinor = (minor: number) => Math.round((Number(minor || 0) / 100) * 100) / 100;

export const truncateForProvider = (value: unknown, maxLength: number, fallback: string) => {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, maxLength);
};

export const toDateYYYYMMDD = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export const toDateYYYYMMDDDashed = (date: Date) => {
  const raw = toDateYYYYMMDD(date);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

export const toTikTokDateTime = (date: Date) =>
  date.toISOString().replace('T', ' ').slice(0, 19);

export const providerLaunchStatus = () => env.ads.providerInitialStatus === 'ACTIVE' ? 'RUNNING' : 'PROVIDER_REVIEW';

export const axiosTimeout = () => env.ads.requestTimeoutMs;

export const normalizeExternalId = (value: any) => {
  if (value === null || value === undefined) return null;
  return String(value);
};

export const providerErrorMessage = (error: any) => {
  const responseData = error?.response?.data;
  const providerMessage = responseData?.error?.message
    || responseData?.message
    || responseData?.msg
    || responseData?.error_description;
  return String(providerMessage || error?.message || 'Provider API request failed').slice(0, 1800);
};

export const assertPublicLandingPage = (url: string) => {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Provider automation requires an HTTPS public landing page URL.');
  }
};

export const readImageAsBuffer = async (url: string) => {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: axiosTimeout(),
  });
  return Buffer.from(response.data);
};
