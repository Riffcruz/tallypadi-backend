import { Request, Response } from 'express';
import { initializePayment } from '../services/billing.service'; // Import your service
import { User } from '../models/user.model';

export const startSubscription = async (req: Request, res: Response) => {
    try {
        // 1. Get User (Assuming you have auth middleware adding user to req)
        // If not, you might need to find user by ID passed in body
        const userId = (req as any).user._id; 
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 2. Get data from frontend
        const { planType, email } = req.body;

        if (!['OGA_BOSS', 'TYCOON'].includes(planType)) {
            return res.status(400).json({ message: 'Invalid plan selected' });
        }

        // 3. Call your existing service
        // We use the email from body, or fallback to user's registered email
        const paystackUrl = await initializePayment(
            user, 
            email || user.email, 
            planType
        );

        if (!paystackUrl) {
            return res.status(500).json({ message: 'Failed to initialize Paystack' });
        }

        // 4. Return the URL to frontend
        return res.status(200).json({ authorizationUrl: paystackUrl });

    } catch (error) {
        console.error('Billing Controller Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};