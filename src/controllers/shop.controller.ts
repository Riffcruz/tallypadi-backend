import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { DailyStats } from '../models/dailyStats.model';
import { z } from 'zod';
import { r2Service } from '../services/r2.service';
import { isSubActive, isTycoon } from '../utils/permissions';

// Schema for updating shop settings
const updateShopSchema = z.object({
  shopSlug: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens').optional(),
  businessName: z.string().min(2).max(50).optional(),
  shopDescription: z.string().max(500).optional(),
  heroImageUrl: z.string().url().optional().or(z.literal('')),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

/**
 * GET /api/shop/me
 * Shop owner gets their own shop info + public URL
 */
export const getShopMe = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId).select('businessName shopSlug shopDescription heroImageUrl planType');

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate public URL
    const publicUrl = user.shopSlug 
      ? `https://tallypadi.com/shop/${user.shopSlug}` 
      : null;

    return res.json({
      businessName: user.businessName,
      shopSlug: user.shopSlug,
      shopDescription: user.shopDescription,
      heroImageUrl: user.heroImageUrl,
      publicUrl,
      isTycoon: user.planType === 'TYCOON',
    });
  } catch (error) {
    console.error('Error fetching my shop:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/shop/:slug
 * Public endpoint to fetch shop details (no products here, just info)
 */
export const getShopBySlug = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug } = req.params;

    if (!slug) return res.status(400).json({ error: 'Shop slug required' });

    const shopOwner = await User.findOne({ shopSlug: slug })
      .select('businessName phoneNumber planType settings _id subscriptionStatus trialEndsAt shopDescription heroImageUrl themeColor');

    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });

    // ✅ Enforce Plan & Subscription
    if (!isTycoon(shopOwner) || !isSubActive(shopOwner)) {
       return res.status(404).json({ error: 'Shop is currently unavailable' });
    }

    const planExpired = !isSubActive(shopOwner); // Should be false here if we passed above, but kept for frontend prop compatibility if needed.

    // Fetch categories for filtering
    const categories = await Inventory.distinct('category', { user: shopOwner._id });
    const cleanCategories = categories.filter((c) => c && typeof c === 'string' && c.trim() !== '');

    return res.json({
      shop: {
        id: shopOwner._id,
        name: shopOwner.businessName,
        description: shopOwner.shopDescription,
        heroImageUrl: shopOwner.heroImageUrl,
        phone: shopOwner.phoneNumber,
        planExpired,
        categories: cleanCategories.sort(),
        themeColor: shopOwner.themeColor || '#10b981',
      },
    });
  } catch (error) {
    console.error('Error fetching shop:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/shop/:slug/products
 * Public endpoint to fetch paginated products
 */
export const getShopProducts = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug } = req.params;
    const { page = '1', q, category, sort } = req.query;

    const shopOwner = await User.findOne({ shopSlug: slug }).select('_id planType subscriptionStatus trialEndsAt');
    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });

    // Ensure shop is active (Tycoon + Valid Sub)
    if (!isTycoon(shopOwner) || !isSubActive(shopOwner)) {
        return res.status(404).json({ error: 'Shop unavailable' });
    }
    
    // Check expiration logic if needed, or allow browsing but disable cart? 
    // For now, let's allow browsing.

    const limit = 20;
    const skip = (Number(page) - 1) * limit;

    const filter: any = {
      user: shopOwner._id,
      quantity: { $gt: 0 }, // Only in-stock
    };

    if (q) {
      filter.name = { $regex: String(q), $options: 'i' };
    }

    if (category) {
      filter.category = String(category).toLowerCase();
    }

    let sortOptions: any = { createdAt: -1 }; // Default newest
    if (sort === 'price_asc') sortOptions = { lastUnitPrice: 1 };
    if (sort === 'price_desc') sortOptions = { lastUnitPrice: -1 };

    const [products, total] = await Promise.all([
      Inventory.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select('name quantity lastUnitPrice image category'),
      Inventory.countDocuments(filter),
    ]);

    return res.json({
      products: products.map(p => ({
        id: p._id,
        name: p.name,
        price: p.lastUnitPrice,
        image: p.image,
        category: p.category,
        inStock: p.quantity > 0,
      })),
      pagination: {
        page: Number(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/**
 * PUT /api/shop/me
 * Update shop slug, name, description, hero.
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
      if (existing && String(existing._id) !== String(user._id)) {
        return res.status(400).json({ error: 'Shop link is already taken.' });
      }
      user.shopSlug = body.shopSlug;
    }

    if (body.businessName !== undefined) user.businessName = body.businessName;
    if (body.shopDescription !== undefined) user.shopDescription = body.shopDescription;
    
    // Handle Hero Image + Deletion
    if (body.heroImageUrl !== undefined) {
      if (user.heroImageUrl && user.heroImageUrl !== body.heroImageUrl) {
         await r2Service.deleteFile(user.heroImageUrl);
      }
      user.heroImageUrl = body.heroImageUrl || undefined;
    }

    if (body.themeColor !== undefined) user.themeColor = body.themeColor;

    await user.save();

    return res.json({
      message: 'Shop settings updated',
      shopSlug: user.shopSlug,
      businessName: user.businessName,
      shopDescription: user.shopDescription,
      heroImageUrl: user.heroImageUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Error updating shop settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/shop/:slug/products/:productId
 * Public endpoint to fetch a single product for metadata
 */
export const getShopProductById = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug, productId } = req.params;

    const shopOwner = await User.findOne({ shopSlug: slug }).select('_id planType subscriptionStatus trialEndsAt');
    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });

    if (!isTycoon(shopOwner) || !isSubActive(shopOwner)) {
        return res.status(404).json({ error: 'Shop unavailable' });
    }

    const product = await Inventory.findOne({ 
      _id: productId, 
      user: shopOwner._id 
    }).select('name lastUnitPrice image quantity category');

    if (!product) return res.status(404).json({ error: 'Product not found' });

    return res.json({
      id: product._id,
      name: product.name,
      price: product.lastUnitPrice,
      image: product.image,
      category: product.category,
      inStock: product.quantity > 0,
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/shop/:slug/visit
 * Record a visit to the shop
 */
export const recordShopVisit = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ error: 'Slug required' });

    const shopOwner = await User.findOne({ shopSlug: slug }).select('_id planType');
    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });
    
    // We count visits even if plan is expired, so owner sees missed traffic? 
    // Or only active shops? Let's count all valid slugs.

    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

    await DailyStats.updateOne(
      { user: shopOwner._id, date: today },
      { $inc: { totalVisits: 1 } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error recording visit:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};