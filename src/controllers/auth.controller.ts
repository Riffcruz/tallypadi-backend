import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { ProcessedMessage } from '../models/processedMessage.model';
import { sendWhatsAppText, sendWhatsAppTemplate } from '../services/whatsapp.service';
import { isSubActive, isTycoon } from '../utils/permissions';
import { PushSubscription } from '../models/pushSubscription.model';

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

  // Handle 080... -> 23480...
  if (digits.length === 11 && digits.startsWith('0')) {
    out.add(`234${digits.slice(1)}`);
    out.add(`+234${digits.slice(1)}`);
  }

  // Handle 23480... -> 080...
  if (digits.length === 13 && digits.startsWith('234')) {
    out.add(`0${digits.slice(3)}`);
  }

  return Array.from(out);
};

// --- Staff OTP Login ---

export const requestStaffLoginOTP = async (req: Request, res: Response) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Please provide phone number' });

    // Normalize phone
    const candidates = buildPhoneCandidates(identifier);
    const user = await User.findOne({ phoneNumber: { $in: candidates } });

    if (!user) {
      // For security, maybe mimic success? But for staff UX, failure is better.
      return res.status(404).json({ error: 'Staff user not found' });
    }

    if (user.role !== 'STAFF') {
        return res.status(403).json({ error: 'This login method is only for staff members.' });
    }
    
    // Check if suspended
    if (user.subscriptionStatus === 'suspended') {
      return res.status(403).json({
        error: 'Account suspended',
        reason: user.suspensionReason || 'Security policy',
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.otp = otp;
    user.otpExpires = expires;
    await user.save();

    // Send via WhatsApp Text (Simpler/Safer than template for now)
    await sendWhatsAppText(user.phoneNumber, `Your TallyPadi Staff Login Code: ${otp}`);

    return res.json({ success: true, message: 'OTP sent to WhatsApp' });

  } catch (err) {
    console.error('Staff Login OTP Request Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const loginStaffWithOTP = async (req: Request, res: Response) => {
    try {
        const { identifier, otp } = req.body;
        if (!identifier || !otp) {
            return res.status(400).json({ error: 'Please provide phone number and OTP' });
        }
        
        const candidates = buildPhoneCandidates(identifier);
        
        // Select fields needed
        const user = await User.findOne({ phoneNumber: { $in: candidates } }).select('+otp +otpExpires +password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.role !== 'STAFF') {
             return res.status(403).json({ error: 'This login method is only for staff members.' });
        }

        // ✅ Check Owner Status (Plan & Subscription)
        if (user.ownerId) {
             const owner = await User.findById(user.ownerId);
             if (owner) {
                 if (!isSubActive(owner)) {
                     return res.status(403).json({ error: "Shop owner's subscription is inactive. Staff login disabled." });
                 }
                 if (!isTycoon(owner)) {
                     return res.status(403).json({ error: "Staff access is only available on the Tycoon plan." });
                 }
             }
        }

        if (user.subscriptionStatus === 'suspended') {
             return res.status(403).json({
                error: 'Account suspended',
                reason: user.suspensionReason || 'Security policy',
            });
        }

        if (!user.otp || user.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        if (!user.otpExpires || user.otpExpires < new Date()) {
            return res.status(400).json({ error: 'OTP expired' });
        }

        // Success - Clear OTP
        user.otp = undefined;
        user.otpExpires = undefined;
        user.lastLogin = new Date();
        await user.save();

        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET missing');

        const token = jwt.sign(
            {
                id: String(user._id),
                role: user.role,
            },
            secret,
            {
                expiresIn: '1y',
                algorithm: 'HS256',
                issuer: process.env.JWT_ISSUER || 'tallypadi',
                audience: process.env.JWT_AUDIENCE || 'tallypadi-web',
            }
        );

        return res.json({
            success: true,
            token,
            user: {
                id: String(user._id),
                name: user.name || 'Staff',
                phoneNumber: user.phoneNumber,
                email: user.email,
                businessName: user.businessName,
                role: user.role,
                planType: user.planType,
                subscriptionStatus: user.subscriptionStatus,
                trialEndsAt: user.trialEndsAt,
                countryCode: user.countryCode,
            }
        });

    } catch (err) {
        console.error('Staff Login Error:', err);
        return res.status(500).json({ error: 'Server Error' });
    }
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
      ? { email: { $regex: `^${identifier}$`, $options: 'i' } }
      : { phoneNumber: { $in: buildPhoneCandidates(identifier) } };

    // select password explicitly
    const user = await User.findOne(userQuery).select('+password');

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
        expiresIn: '1y',
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

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { phoneNumber, businessName, password, closingTime, language, countryCode, email } = req.body;

    if (!phoneNumber || !businessName || !password || !email) {
      return res.status(400).json({ error: 'Please provide phone number, email, shop name, and password' });
    }

    // Normalize phone (digits only)
    const identifier = normalizePhone(phoneNumber);
    if (!identifier || identifier.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    // Check existing phone
    const existingUserPhone = await User.findOne({ phoneNumber: identifier });
    if (existingUserPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Check existing email
    const emailLower = email.trim().toLowerCase();
    if (!isValidEmail(emailLower)) {
       return res.status(400).json({ error: 'Invalid email address' });
    }

    const existingUserEmail = await User.findOne({ email: emailLower });
    if (existingUserEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      phoneNumber: identifier,
      email: emailLower,
      businessName: sanitizeString(businessName) || undefined,
      password: hashedPassword,
      settings: {
        closingTime: closingTime || '20:00',
        language: language || 'English',
        utcOffsetMinutes: 60, // Default to WAT (Lagos)
        dailySummaryEnabled: false,
        pdfReportsEnabled: true
      },
      countryCode: countryCode || 'NG',
      registrationStage: 'COMPLETED',
      role: 'OWNER',
      planType: 'TYCOON', 
    });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET not configured');
    }

    const token = jwt.sign(
      {
        id: String(newUser._id),
        role: newUser.role,
      },
      secret,
      {
        expiresIn: '1y',
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER || 'tallypadi',
        audience: process.env.JWT_AUDIENCE || 'tallypadi-web',
      }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: String(newUser._id),
        name: newUser.name,
        phoneNumber: newUser.phoneNumber,
        email: newUser.email,
        businessName: newUser.businessName,
        role: newUser.role,
        planType: newUser.planType,
        subscriptionStatus: newUser.subscriptionStatus,
        trialEndsAt: newUser.trialEndsAt,
      }
    });

  } catch (err: unknown) {
    console.error('Register Error:', err);
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        return res.status(400).json({ error: 'Phone number or email already registered' });
    }
    return res.status(500).json({ error: 'Server Error' });
  }
};


// --- Forgot Password ---

export const requestForgotPasswordOTP = async (req: Request, res: Response) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Please provide phone number' });

    // Normalize input
    const digits = normalizePhone(identifier);
    // Try to find user. Handle 0-prefix or 234-prefix.
    // We'll use the buildPhoneCandidates helper logic implicitly or just query.
    // User might enter '090...' or '23490...'
    const candidates = buildPhoneCandidates(identifier);
    
    const user = await User.findOne({ phoneNumber: { $in: candidates } });
    if (!user) {
      // Security: don't reveal user existence? 
      // For this app context (business tool), clear feedback might be better for UX.
      return res.status(404).json({ error: 'User not found' });
    }

    // Check 24h interaction
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Check if user has been seen (lastSeen) in the last 24h
    if (!user.lastSeen || user.lastSeen < oneDayAgo) {
      // Fallback: Check ProcessedMessage (for older interactions before lastSeen was added)
      const lastMsg = await ProcessedMessage.findOne({
        user: user._id,
        createdAt: { $gte: oneDayAgo }
      });

      if (!lastMsg) {
        return res.status(400).json({ 
          error: 'No recent interaction. Please send a "Hello" to the bot on WhatsApp first to enable OTP.' 
        });
      }
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.otp = otp;
    user.otpExpires = expires;
    await user.save();

    // Send via WhatsApp
    await sendWhatsAppText(user.phoneNumber, `Your TallyPadi Password Reset OTP is: ${otp}`);

    return res.json({ success: true, message: 'OTP sent to WhatsApp' });
  } catch (err) {
    console.error('Forgot Password Request Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const candidates = buildPhoneCandidates(identifier);
    const user = await User.findOne({ phoneNumber: { $in: candidates } }).select('+password +otp +otpExpires');

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Reset
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// --- Change Phone Number ---

export const requestChangePhoneOTP = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id; // from authRequired
    const { newPhoneNumber } = req.body;

    if (!newPhoneNumber) return res.status(400).json({ error: 'New phone number required' });

    // Normalize to 234 format
    let normalized = normalizePhone(newPhoneNumber);
    if (normalized.startsWith('0')) {
        normalized = '234' + normalized.slice(1);
    } else if (normalized.length === 10) { 
       // rough guess, assume NG if 10 digits without 0? Or just leave it.
       // The prompt says "number should be saved with this format '2349081888873'"
       // If user types '234...' it's fine.
    }
    // ensure no '+'
    normalized = normalized.replace('+', '');

    // Check conflict
    const existing = await User.findOne({ phoneNumber: normalized });
    if (existing) {
      return res.status(400).json({ error: 'Phone number already in use' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = expires;
    user.tempPhone = normalized;
    await user.save();

    // Send OTP to CURRENT number to verify ownership (Security)
    await sendWhatsAppText(user.phoneNumber, `Security Check: Use OTP ${otp} to change your TallyPadi phone number to ${normalized}.`);

    return res.json({ success: true, message: 'OTP sent to your CURRENT WhatsApp number.' });
  } catch (err) {
    console.error('Change Phone Request Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const verifyChangePhoneOTP = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { otp } = req.body;

    if (!otp) return res.status(400).json({ error: 'OTP required' });

    const user = await User.findById(userId).select('+otp +otpExpires +tempPhone');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (!user.tempPhone) {
        return res.status(400).json({ error: 'No pending phone change' });
    }

    // Commit change
    user.phoneNumber = user.tempPhone;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.tempPhone = undefined;
    await user.save();

    return res.json({ success: true, message: 'Phone number updated successfully' });
  } catch (err) {
    console.error('Verify Change Phone Error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const subscribeUserPush = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const subscription = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
       return res.status(400).json({ error: 'Invalid subscription payload' });
    }

    // Upsert to avoid duplicates for the same browser endpoint
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint }, // find by unique browser endpoint
      {
        userId: userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: req.headers['user-agent']
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: 'Push subscription saved' });
  } catch (err) {
    console.error('Push Subscribe Error:', err);
    res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
};
