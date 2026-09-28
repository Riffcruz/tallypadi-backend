import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { DailyStats } from '../models/dailyStats.model';
import { z } from 'zod';
import { r2Service } from '../services/r2.service';
import { isSubActive, isTycoon } from '../utils/permissions';
import {
  getPublicProductImage,
  getStoreSetupStatus,
  getVerificationBadge,
} from '../services/marketplaceTrust.service';
import { getMarketplaceProductSeo } from '../services/marketplaceSeo.service';
import { queueMarketplaceOwnerRefresh } from '../services/queue.service';
import { orderService } from '../services/order.service';
import { activityService } from '../services/activity.service';
import { randomBytes } from 'crypto';

const PUBLIC_SHOP_CACHE = 'public, max-age=30, s-maxage=120, stale-while-revalidate=300';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Schema for updating shop settings
const updateShopSchema = z.object({
  shopSlug: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens').optional(),
  businessName: z.string().min(2).max(50).optional(),
  shopDescription: z.string().max(500).optional(),
  heroImageUrl: z.string().url().optional().or(z.literal('')),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  location: z.object({
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
});

/**
 * GET /api/shop/me
 * Shop owner gets their own shop info + public URL
 */
export const getShopMe = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId).select('businessName phoneNumber shopSlug shopDescription heroImageUrl planType themeColor settings.location marketplaceVerificationStatus marketplaceVerifiedAt');

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
      themeColor: user.themeColor,
      location: user.settings?.location,
      publicUrl,
      isTycoon: user.planType === 'TYCOON',
      storeSetup: getStoreSetupStatus(user),
      verification: getVerificationBadge(user),
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
    res.set('Cache-Control', PUBLIC_SHOP_CACHE);

    const { slug } = req.params;

    if (!slug) return res.status(400).json({ error: 'Shop slug required' });

    const shopOwner = await User.findOne({ shopSlug: slug })
      .select('businessName phoneNumber planType settings _id subscriptionStatus trialEndsAt shopDescription heroImageUrl themeColor countryCode marketplaceVerificationStatus marketplaceVerifiedAt');

    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });

    // Direct shop links should remain public for active sellers with a slug.
    // Marketplace discovery applies the stricter completed-settings readiness gate.
    if (!isTycoon(shopOwner) || !isSubActive(shopOwner)) {
       return res.status(404).json({ error: 'Shop is currently unavailable' });
    }

    const planExpired = !isSubActive(shopOwner); // Should be false here if we passed above, but kept for frontend prop compatibility if needed.

    // Fetch categories for filtering
    const categories = await Inventory.distinct('category', { user: shopOwner._id });
    const cleanCategories = categories.filter((c) => c && typeof c === 'string' && c.trim() !== '');

    // Derive Currency Map locally (to match dashboard)
    const getCurrencyCode = (cCode: string = 'NG') => {
      const map: Record<string, string> = {
        'NG': 'NGN', 'US': 'USD', 'GB': 'GBP', 'GH': 'GHS',
        'KE': 'KES', 'ZA': 'ZAR', 'EU': 'EUR'
      };
      return map[cCode.toUpperCase()] || 'NGN';
    };

    const shopCurrency = shopOwner.settings?.currencyCode || getCurrencyCode(shopOwner.countryCode);

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
        currencyCode: shopCurrency,
        location: {
          country: shopOwner.settings?.location?.country || 'NG',
          state: shopOwner.settings?.location?.state || '',
          city: shopOwner.settings?.location?.city || '',
          address: shopOwner.settings?.location?.address || '',
        },
        verification: getVerificationBadge(shopOwner),
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
    res.set('Cache-Control', PUBLIC_SHOP_CACHE);

    const { slug } = req.params;
    const { page = '1', q, category, sort } = req.query;

    const shopOwner = await User.findOne({ shopSlug: slug }).select('_id planType subscriptionStatus trialEndsAt businessName phoneNumber shopSlug shopDescription countryCode settings.location settings.currencyCode marketplaceVerificationStatus marketplaceVerifiedAt');
    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });

    // Keep direct shop links browsable even when marketplace readiness is incomplete.
    if (!isTycoon(shopOwner) || !isSubActive(shopOwner)) {
        return res.status(404).json({ error: 'Shop unavailable' });
    }
    
    // Check expiration logic if needed, or allow browsing but disable cart? 
    // For now, let's allow browsing.

    const limit = 20;
    const skip = (Number(page) - 1) * limit;

    const filter: Record<string, unknown> = {
      user: shopOwner._id,
      quantity: { $gt: 0 }, // Only in-stock
      isPublished: { $ne: false }, // Only published
    };

    if (q) {
      filter.name = { $regex: escapeRegExp(String(q).slice(0, 80)), $options: 'i' };
    }

    if (category) {
      filter.category = String(category).toLowerCase();
    }

    let sortOptions: Record<string, 1 | -1> = { createdAt: -1 }; // Default newest
    if (sort === 'price_asc') sortOptions = { lastUnitPrice: 1 };
    if (sort === 'price_desc') sortOptions = { lastUnitPrice: -1 };

    const [products, total] = await Promise.all([
      Inventory.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select('name quantity lastUnitPrice image category description colors sizes marketplaceSeo boosts'),
      Inventory.countDocuments(filter),
    ]);

    return res.json({
      products: products.map(p => {
        const activeBoost = (p.boosts || []).find((boost) => new Date(boost.expiresAt).getTime() > Date.now());
        const seo = getMarketplaceProductSeo(p, shopOwner, activeBoost);
        return {
          id: p._id,
          name: p.name,
          price: p.lastUnitPrice,
          image: getPublicProductImage(p.image),
          category: p.category,
          description: p.description,
          colors: p.colors,
          sizes: p.sizes,
          inStock: p.quantity > 0,
          availableQuantity: p.quantity,
          isBoosted: Boolean(activeBoost),
          seo,
        };
      }),
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

export const createStorefrontOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    const slug = String(req.params.slug || '').trim();
    const customerName = String(req.body?.customerName || '').trim().slice(0, 120);
    const customerPhone = String(req.body?.customerPhone || '').trim().slice(0, 32);
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 25) : [];

    if (customerName.length < 2 || !/^[+]?[\d\s\-()]{7,32}$/.test(customerPhone) || requestedItems.length === 0) {
      return res.status(400).json({ error: 'Name, phone number and cart items are required.' });
    }

    const owner = await User.findOne({ shopSlug: slug }).select('_id businessName planType subscriptionStatus trialEndsAt');
    if (!owner || !isTycoon(owner) || !isSubActive(owner)) return res.status(404).json({ error: 'Shop unavailable' });

    const ids = requestedItems.map((item: any) => String(item?.productId || '')).filter((id: string) => /^[a-f\d]{24}$/i.test(id));
    const products = await Inventory.find({ _id: { $in: ids }, user: owner._id, quantity: { $gt: 0 }, isPublished: { $ne: false } })
      .select('name quantity lastUnitPrice')
      .lean();
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    const lines: string[] = [];
    const items: Array<{ product: any; name: string; quantity: number; unitPrice: number; lineTotal: number }> = [];
    let total = 0;
    for (const requested of requestedItems) {
      const product = productMap.get(String(requested?.productId || ''));
      if (!product) return res.status(400).json({ error: 'One or more products are unavailable.' });
      const quantity = Math.max(1, Math.min(Math.trunc(Number(requested?.quantity) || 1), Number(product.quantity)));
      const lineTotal = Number(product.lastUnitPrice || 0) * quantity;
      total += lineTotal;
      lines.push(`${quantity} × ${product.name}`);
      items.push({ product: product._id, name: product.name, quantity, unitPrice: Number(product.lastUnitPrice || 0), lineTotal });
    }

    const publicReference = `TP-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;

    const order = await orderService.createOrder(owner._id, {
      description: lines.join(', ').slice(0, 500),
      customerName,
      customerPhone,
      price: total,
      amountPaid: 0,
      deliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'PENDING',
      source: 'STOREFRONT',
      publicReference,
      storefrontSlug: slug,
      items,
    });

    await activityService.recordActivitySafely({
      user: owner._id,
      type: 'ORDER',
      title: 'New storefront order',
      message: `${customerName} placed order ${publicReference}`,
      amount: total,
      metadata: { orderId: order._id, publicReference, source: 'STOREFRONT' },
    });

    return res.status(201).json({ orderId: order._id, reference: publicReference, total });
  } catch (error) {
    console.error('Create Storefront Order Error:', error);
    return res.status(500).json({ error: 'Could not create order.' });
  }
};


/**
 * PUT /api/shop/me
 * Update shop slug, name, description, hero.
 */
export const updateShopSettings = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
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
    
    if (body.location !== undefined) {
      if (!user.settings) user.settings = {} as any;
      if (!user.settings!.location) user.settings!.location = { country: 'NG', state: '', city: '', address: '' };
      if (body.location.country !== undefined) user.settings!.location.country = body.location.country;
      if (body.location.state !== undefined) user.settings!.location.state = body.location.state;
      if (body.location.city !== undefined) user.settings!.location.city = body.location.city;
      if (body.location.address !== undefined) user.settings!.location.address = body.location.address;
    }

    await user.save();
    queueMarketplaceOwnerRefresh(user._id, 'shop-settings-update').catch(() => undefined);

    return res.json({
      message: 'Shop settings updated',
      shopSlug: user.shopSlug,
      businessName: user.businessName,
      shopDescription: user.shopDescription,
      heroImageUrl: user.heroImageUrl,
      storeSetup: getStoreSetupStatus(user),
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
    res.set('Cache-Control', PUBLIC_SHOP_CACHE);

    const { slug, productId } = req.params;

    const shopOwner = await User.findOne({ shopSlug: slug }).select('_id planType subscriptionStatus trialEndsAt businessName phoneNumber shopSlug shopDescription countryCode settings.location settings.currencyCode marketplaceVerificationStatus marketplaceVerifiedAt');
    if (!shopOwner) return res.status(404).json({ error: 'Shop not found' });

    if (!isTycoon(shopOwner) || !isSubActive(shopOwner)) {
        return res.status(404).json({ error: 'Shop unavailable' });
    }

    const product = await Inventory.findOne({ 
      _id: productId, 
      user: shopOwner._id,
      quantity: { $gt: 0 },
      isPublished: { $ne: false },
      isDeleted: { $ne: true },
    }).select('name lastUnitPrice image quantity category description colors sizes boosts marketplaceSeo');

    if (!product) return res.status(404).json({ error: 'Product not found' });

    const activeBoost = (product.boosts || []).find((boost) => new Date(boost.expiresAt).getTime() > Date.now());
    const seo = getMarketplaceProductSeo(product, shopOwner, activeBoost);

    return res.json({
      id: product._id,
      name: product.name,
      price: product.lastUnitPrice,
      image: getPublicProductImage(product.image),
      category: product.category,
      description: product.description,
      colors: product.colors,
      sizes: product.sizes,
      inStock: product.quantity > 0,
      isBoosted: Boolean(activeBoost),
      seo,
      shopVerification: getVerificationBadge(shopOwner),
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
