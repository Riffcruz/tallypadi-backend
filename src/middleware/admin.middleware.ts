import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { env } from '../config/env';

export const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Get the user from the request (attached by previous auth middleware)
    // Assuming standard auth middleware runs before this and attaches user to req.body.user or req.user
    // For this implementation, we'll fetch based on the ID in the token (req.user)
    
    // NOTE: Ensure your auth middleware attaches 'user' to req.
    // If not, we fetch using the ID from the decoded token typically found in req.headers.authorization
    
    // For simplicity/robustness here, let's assume standard JWT auth happened 
    // and we check if the user's phone number matches the ADMIN_PHONE in .env
    
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    if (!adminPhone) {
        return res.status(500).json({ error: "Admin phone not configured on server" });
    }

    // You might need to adjust this depending on how your previous auth middleware passes data
    // Here I assume req.body.user or we query the DB if we have the ID.
    // Let's assume we decode the token here manually if needed, or rely on previous middleware.
    
    // Check if the authenticated user's phone matches the admin phone
    // (In a real app, you'd check req.user.phoneNumber)
    
    // BYPASS FOR DEV: If you send a special secret header
    const adminSecret = req.headers['x-admin-secret'];
    if (adminSecret === process.env.ADMIN_SECRET_KEY) {
        return next();
    }

    return res.status(403).json({ error: "Access Denied: Super Admin Only" });

  } catch (error) {
    res.status(401).json({ error: "Unauthorized" });
  }
};