import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
// import { env } from '../config/env'; // keeping import if you use it, but using process.env below for compatibility

// --- Security Helpers ---

/**
 * Validates that the input is a valid string.
 * Returns the trimmed string or null if invalid.
 */
const sanitizeString = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    return input.trim();
};

// --- Controller ---

export const loginUser = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    // 🛡️ SECURITY CHECK 1: Input Sanitization
    // We accept 'identifier', 'email', or 'phoneNumber' to be flexible
    // This allows the frontend to send a single field "identifier" for both email/phone
    let identifier = sanitizeString(body.identifier) || sanitizeString(body.email) || sanitizeString(body.phoneNumber);
    const password = sanitizeString(body.password);

    // 🛡️ SECURITY CHECK 2: Validation
    if (!identifier || !password) {
      return res.status(400).json({ error: "Please provide email/phone and password" });
    }

    // Determine login type
    const isEmail = identifier.includes('@');
    
    // Normalize email input to lowercase
    if (isEmail) {
        identifier = identifier.toLowerCase();
    }

    // 1. Find User (explicitly select password)
    // Dynamic query: checks 'email' field if it looks like an email, otherwise checks 'phoneNumber'
    const query = isEmail ? { email: identifier } : { phoneNumber: identifier };
    
    const user = await User.findOne(query).select('+password');

    // 🛡️ SECURITY CHECK 3: Generic Error Messages
    // Never say "User not found" or "Wrong Password". 
    // Just say "Invalid credentials" so hackers don't know which one they got right.
    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 2. Compare Passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 3. Generate Token
    const token = jwt.sign(
      { 
          id: user._id, 
          phone: user.phoneNumber,
          email: user.email // Added email to token payload
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '30d' }
    );

    // 🛡️ SECURITY CHECK 4: Don't send the password back!
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        phoneNumber: user.phoneNumber,
        email: user.email,
        businessName: user.businessName
      } 
    });

  } catch (err) {
    console.error("Login Error:", err); 
    // 🛡️ SECURITY CHECK 5: Don't send error details to client
    res.status(500).json({ error: "Server Error" });
  }
};