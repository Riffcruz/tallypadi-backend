import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';

// --- Helpers ---

const sanitizeString = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return s.length ? s : null;
};

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Normalize phone to digits-only.
 * Examples:
 *  "+234 908-118-8473" -> "2349081188473"
 *  "09081188473" -> "09081188473" (we keep it, and query with both forms)
 */
const normalizePhone = (s: string) => s.replace(/[^\d]/g, '').trim();

/**
 * Build phone variants to improve match chance depending on how you stored it.
 * - "0908..." might be stored as "234908..." or "0908..."
 * - "+234..." might be stored as "234..." or "+234..."
 */
const buildPhoneCandidates = (raw: string): string[] => {
  const digits = normalizePhone(raw);
  if (!digits) return [];

  const out = new Set<string>();
  out.add(digits);

  // if stored with '+'
  out.add(`+${digits}`);

  // if NG local format like 0XXXXXXXXXX -> also try 234XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('0')) {
    out.add(`234${digits.slice(1)}`);
    out.add(`+234${digits.slice(1)}`);
  }

  return Array.from(out);
};

// --- Controller ---

export const loginUser = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    let identifier =
      sanitizeString(body.identifier) ||
      sanitizeString(body.email) ||
      sanitizeString(body.phoneNumber);

    const password = sanitizeString(body.password);

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide email/phone and password' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET is missing in environment');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Prevent crazy-long inputs
    if (identifier.length > 200 || password.length > 500) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const looksLikeEmail = isValidEmail(identifier);

    let user: any = null;

    if (looksLikeEmail) {
      const email = identifier.toLowerCase();
      user = await User.findOne({ email }).select('+password');
    } else {
      const phoneCandidates = buildPhoneCandidates(identifier);
      user = await User.findOne({ phoneNumber: { $in: phoneCandidates } }).select('+password');
    }

    // Generic error (don’t leak which part failed)
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ✅ include only what you need
    const token = jwt.sign(
      {
        id: String(user._id),
        phone: user.phoneNumber,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // ✅ Return fields your frontend uses (SalesPage checks these)
    return res.json({
      success: true,
      token,
      user: {
        id: String(user._id),
        name: user.name || null,
        phoneNumber: user.phoneNumber,
        email: user.email,
        businessName: user.businessName || null,

        // frontend expects these for access control
        planType: user.planType || 'OGA_BOSS',
        subscriptionStatus: user.subscriptionStatus || null,
        trialEndsAt: user.trialEndsAt || null,

        // optional but helpful
        countryCode: user.countryCode || null,
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};
