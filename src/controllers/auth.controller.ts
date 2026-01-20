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

const normalizePhone = (s: string) => s.replace(/[^\d]/g, '').trim();

const buildPhoneCandidates = (raw: string): string[] => {
  const digits = normalizePhone(raw);
  if (!digits) return [];

  const out = new Set<string>();
  out.add(digits);
  out.add(`+${digits}`);

  if (digits.length === 11 && digits.startsWith('0')) {
    out.add(`234${digits.slice(1)}`);
    out.add(`+234${digits.slice(1)}`);
  }

  return Array.from(out);
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    const identifier =
      sanitizeString(body.identifier) ||
      sanitizeString(body.email) ||
      sanitizeString(body.phoneNumber);

    const password = sanitizeString(body.password);

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide email/phone and password' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('❌ JWT_SECRET is missing in environment');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Anti-DoS / sanity
    if (identifier.length > 200 || password.length > 500) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const looksLikeEmail = isValidEmail(identifier);

    const userQuery = looksLikeEmail
      ? { email: identifier.toLowerCase() }
      : { phoneNumber: { $in: buildPhoneCandidates(identifier) } };

    // select password explicitly
    const user: any = await User.findOne(userQuery).select('+password');

    // generic error
    if (!user?.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ✅ block suspended users
    if (user.subscriptionStatus === 'suspended') {
      return res.status(403).json({
        error: 'Account suspended',
        reason: user.suspensionReason || 'Security policy',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ✅ Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    // Keep JWT small: just user id (and role if needed)
    const token = jwt.sign(
      {
        id: String(user._id),
        role: user.role || 'OWNER',
      },
      secret,
      {
        expiresIn: '30d',
        algorithm: 'HS256',
        // optional hardening (set envs if you use them)
        issuer: process.env.JWT_ISSUER || 'tallypadi',
        audience: process.env.JWT_AUDIENCE || 'tallypadi-web',
      }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: String(user._id),
        name: user.name || null,
        phoneNumber: user.phoneNumber,
        email: user.email,
        businessName: user.businessName || null,

        planType: user.planType || 'OGA_BOSS',
        subscriptionStatus: user.subscriptionStatus || null,
        trialEndsAt: user.trialEndsAt || null,
        countryCode: user.countryCode || null,

        role: user.role || 'OWNER',
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};


