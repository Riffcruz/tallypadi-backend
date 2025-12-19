import { Request, Response } from 'express';
import axios from 'axios';

// Very small in-memory cache
let FX_CACHE: any = null;
let FX_CACHE_TIME = 0;

// Returns USD base rates so frontend can convert any currency
// Source: open.er-api.com (no API key)
export const getFxRates = async (req: Request, res: Response) => {
  try {
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    if (FX_CACHE && Date.now() - FX_CACHE_TIME < SIX_HOURS) {
      return res.json(FX_CACHE);
    }

    const r = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 12000 });
    const rates = r.data?.rates || {};

    FX_CACHE = {
      base: 'USD',
      rates,
      updatedAt: new Date().toISOString(),
    };
    FX_CACHE_TIME = Date.now();

    return res.json(FX_CACHE);
  } catch (e) {
    console.error('FX Error:', e);
    return res.status(500).json({ error: 'Failed to fetch FX rates' });
  }
};
