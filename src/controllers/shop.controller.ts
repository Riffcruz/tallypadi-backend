import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { z } from 'zod';

// Schema for updating shop settings
const updateShopSchema = z.object({
  shopSlug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens')
    .optional(),
  businessName: z.string().min(2).max(50).optional(),
});

/**
 * GET /api/shop/:slug
 * Public endpoint to fetch shop details and inventory
 */
export const getShopBySlug = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({ error: 'Shop name is required' });
    }

    // 1. Find User by shopSlug
    const shopOwner = await User.findOne({
      shopSlug: slug,
      // Ensure user is valid/active if needed, but for now just existence
    }).select('businessName phoneNumber planType settings _id subscriptionStatus trialEndsAt');

    if (!shopOwner) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // 2. Check if Tycoon (Only Tycoon users have shops enabled)
    if (shopOwner.planType !== 'TYCOON') {
       return res.status(404).json({ error: 'Shop is currently unavailable' });
    }

    // Check plan expiration
    const now = new Date();
    const isTrial = shopOwner.subscriptionStatus === 'trial';
    const isTrialExpired = isTrial && shopOwner.trialEndsAt < now;
    const isPlanExpired = ['past_due', 'cancelled', 'suspended'].includes(shopOwner.subscriptionStatus);
    const planExpired = isTrialExpired || isPlanExpired;

    // 3. Fetch Inventory
    // Only fetch items with quantity > 0? Or all? Usually storefronts show what's available.
    const products = await Inventory.find({
      user: shopOwner._id,
      quantity: { $gt: 0 }, // Only show in-stock items
    }).select('name quantity lastUnitPrice image');

    return res.json({
      shop: {
        name: shopOwner.businessName,
        phone: shopOwner.phoneNumber,
        planExpired,
      },
      products,
    });
  } catch (error) {
    console.error('Error fetching shop:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/shop/settings
 * Update shop slug and name. Tycoon only.
 */
export const updateShopSettings = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user.id;
    const body = updateShopSchema.parse(req.body);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: 'Shop feature is only available for Tycoon users.' });
    }

    // Check slug uniqueness if changing
    if (body.shopSlug && body.shopSlug !== user.shopSlug) {
      const existing = await User.findOne({ shopSlug: body.shopSlug });
      if (existing) {
        return res.status(400).json({ error: 'Shop link is already taken.' });
      }
      user.shopSlug = body.shopSlug;
    }

    if (body.businessName) {
      user.businessName = body.businessName;
    }

    await user.save();

    return res.json({
      message: 'Shop settings updated',
      shopSlug: user.shopSlug,
      businessName: user.businessName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Error updating shop settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
