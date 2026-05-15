import { Request, Response } from 'express';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import { saveImageFromBase64 } from '../utils/image';
import { Types } from 'mongoose';
import { parseMessageWithGemini } from '../services/gemini.service';
import { buildMarketplaceProductSeo } from '../services/marketplaceSeo.service';

// --- SKU Generator ---
// Generates a short unique code like "P-4X9M" for a product
function generateSku(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/I/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `P-${code}`;
}

// Generates a SKU and ensures it's unique for this user
async function generateUniqueSku(userId: Types.ObjectId | string): Promise<string> {
  let sku: string;
  let attempts = 0;
  do {
    sku = generateSku();
    const existing = await Inventory.findOne({ user: userId, sku });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);
  return sku;
}

// --- Helpers ---
const sanitizeString = (input: unknown): string | undefined => {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  return trimmed || undefined;
};

const validateNumber = (input: unknown): number | undefined => {
  const n = typeof input === 'string' ? Number(input) : (input as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const sanitizeStringArray = (input: unknown): string[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  return input.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 30);
};

const formatActiveBoosts = (boosts?: { platform: string; expiresAt: Date; planId: string }[]) => {
  const now = Date.now();
  return (boosts || [])
    .filter((boost) => new Date(boost.expiresAt).getTime() > now)
    .map((boost) => ({
      platform: boost.platform,
      planId: boost.planId,
      expiresAt: boost.expiresAt,
    }));
};

// --- Subscription Guard ---
const hasInventoryWriteAccess = (user: { subscriptionStatus?: string, trialEndsAt?: Date | string | null } | null): boolean => {
  if (!user) return false;

  if (user.subscriptionStatus === 'active') return true;

  if (user.subscriptionStatus === 'trial') {
    if (!user.trialEndsAt) return false;
    const trialEndsAtMs = new Date(user.trialEndsAt as string | number | Date).getTime();
    if (!Number.isFinite(trialEndsAtMs)) return false;
    return Date.now() < trialEndsAtMs;
  }

  return false;
};

const denySubscription = (res: Response, user: { subscriptionStatus?: string, trialEndsAt?: Date | string | null } | null) => {
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt).toISOString() : null;

  return res.status(403).json({
    error: 'Subscription Required',
    message:
      user?.subscriptionStatus === 'trial'
        ? 'Your trial has expired. Please subscribe to continue.'
        : 'You must have an active subscription (or active trial) to use this feature.',
    subscriptionStatus: user?.subscriptionStatus || null,
    trialEndsAt,
  });
};

const getAuthUser = async (req: Request) => {
  const userId = req.user?.id || (req as Request & { userId?: string }).userId;
  if (!userId) return null;
  return await User.findById(userId);
};

// GET all inventory items (with optional pagination & search)
export const getInventory = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // ✅ If staff, fetch owner's inventory
    const targetUserId = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : user._id;

    const { page, limit, search } = req.query;
    
    // Base filter
    const filter: Record<string, unknown> = { user: targetUserId };
    
    if (search) {
      const q = String(search).trim();
      // Escape regex special characters to prevent search crashes
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
         { name: { $regex: escapedQ, $options: 'i' } },
         { barcode: { $regex: escapedQ, $options: 'i' } },
         { sku: { $regex: escapedQ, $options: 'i' } },  // ✅ Search by SKU
      ];
    }

    // Determine if request wants pagination
    const isPaginated = page !== undefined || limit !== undefined;
    
    if (isPaginated) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [items, total] = await Promise.all([
        Inventory.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limitNum).lean(),
        Inventory.countDocuments(filter)
      ]);

      const formattedItems = items.map((item) => ({
        id: item._id,
        name: item.name,
        sku: item.sku || null,
        stock: item.quantity,
        price: item.lastUnitPrice || 0,
        costPrice: item.costPrice || 0,
        image: item.image || null,
        category: item.category || null,
        barcode: item.barcode || null,
        isPublished: item.isPublished !== false,
        description: item.description || '',
        colors: item.colors || [],
        sizes: item.sizes || [],
        boosts: formatActiveBoosts(item.boosts),
      }));

      return res.json({
         data: formattedItems,
         pagination: {
            page: pageNum,
            limit: limitNum,
            totalItems: total,
            totalPages: Math.ceil(total / limitNum),
            hasMore: skip + items.length < total
         }
      });
    }

    // Legacy un-paginated request
    const items = await Inventory.find({ user: targetUserId }).lean();

    const formattedItems = (items || []).map((item) => ({
      id: item._id,
      name: item.name,
      sku: item.sku || null,
      stock: item.quantity,
      price: item.lastUnitPrice || 0,
      costPrice: item.costPrice || 0,
      image: item.image || null,
      category: item.category || null,
      barcode: item.barcode || null,
      isPublished: item.isPublished !== false,
      description: item.description || '',
      colors: item.colors || [],
      sizes: item.sizes || [],
      boosts: formatActiveBoosts(item.boosts),
    }));

    return res.json(formattedItems);
  } catch (error) {
    console.error('Inventory Fetch Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// ─── Fuzzy Name Matching Utility ───────────────────────────────────────────
// Normalize a product name: lowercase, strip spaces and punctuation
export const normalizeName = (name: string): string =>
  String(name).toLowerCase().replace(/[\s\-_.,'"]+/g, '');

// Similarity score: how many characters of `a` appear in `b` in sequence (0-1)
const similarityScore = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9; // substring match
  let matches = 0;
  let bIdx = 0;
  for (const ch of a) {
    const found = b.indexOf(ch, bIdx);
    if (found !== -1) { matches++; bIdx = found + 1; }
  }
  return matches / Math.max(a.length, b.length);
};

// Returns up to 3 closest existing inventory items for a given misspelled name
export const fuzzySearchInventory = async (
  userId: string | Record<string, unknown>,
  inputName: string,
  threshold = 0.6
): Promise<{ id: string; name: string; score: number }[]> => {
  const normalizedInput = normalizeName(inputName);
  // Broad regex search: items that share the first 3 chars
  const prefix = normalizedInput.substring(0, 3);
  const candidates = await Inventory.find({
    user: userId as any,
    name: { $regex: prefix.split('').join('.*'), $options: 'i' }
  }).limit(20).lean();


  return candidates
    .map(item => ({
      id: String(item._id),
      name: String(item.name),
      score: similarityScore(normalizedInput, normalizeName(item.name))
    }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};


export const getCategories = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const categories = await Inventory.distinct('category', { user: user._id });
    // Filter out null/empty strings just in case
    const cleanCategories = categories.filter((c) => c && typeof c === 'string' && c.trim() !== '');

    return res.json(cleanCategories);
  } catch (error) {
    console.error('Get Categories Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// ✅ GET single inventory item (needed by SalesPage stock check)
export const getInventoryItem = async (req: Request, res: Response) => {
  try {
    // 🔒 SECURITY FIX: Use getAuthUser instead of User.findOne()
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const item = await Inventory.findOne({ _id: id, user: user._id });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    return res.json({
      id: item._id,
      name: item.name,
      sku: item.sku || null,
      stock: item.quantity,
      quantity: item.quantity,
      price: item.lastUnitPrice || 0,
      lastUnitPrice: item.lastUnitPrice || 0,
      costPrice: item.costPrice || 0,
      image: item.image || null,
      category: item.category || null,
      barcode: item.barcode || null,
    });
  } catch (error) {
    console.error('Get Item Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};


// ADD a new inventory item
export const addInventoryItem = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    const safeStock = validateNumber(body.stock);
    const safePrice = validateNumber(body.price);
    const safeCostPrice = validateNumber(body.costPrice);
    let imageUrl: string | undefined | null;

    // SSRF FIX: Only allow trusted R2 URL or Base64
    const trustedUrl = process.env.R2_PUBLIC_URL || 'https://cdn.tallypadi.com';
    
    if (typeof body.image === 'string') {
        if (body.image.startsWith('data:image/')) {
            imageUrl = saveImageFromBase64(body.image);
        } else if (body.image.startsWith(trustedUrl)) {
             imageUrl = body.image;
        } else {
             // Block arbitrary external URLs
             imageUrl = null; 
        }
    } else {
      imageUrl = null;
    }
    const safeName = sanitizeString(body.name);
    const safeCategory = sanitizeString(body.category); // Sanitize category
    const safeBarcode = sanitizeString(body.barcode); // Sanitize barcode
    const safeDescription = body.description !== undefined ? sanitizeString(body.description) : undefined;
    const safeColors = sanitizeStringArray(body.colors);
    const safeSizes = sanitizeStringArray(body.sizes);

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    if (!safeName) {
      return res.status(400).json({ error: 'Item name is required and must be a string' });
    }

    let item = await Inventory.findOne({ user: user._id, name: safeName.toLowerCase() });

    if (item) {
      const stockToAdd = safeStock !== undefined ? safeStock : 0;
      item.quantity += stockToAdd;

      if (safePrice !== undefined) item.lastUnitPrice = safePrice;
      if (safeCostPrice !== undefined) item.costPrice = safeCostPrice;
      if (imageUrl) item.image = imageUrl;
      if (safeCategory !== undefined) item.category = safeCategory?.toLowerCase();
      if (safeBarcode !== undefined) item.barcode = safeBarcode;
      if (body.isPublished !== undefined) item.isPublished = Boolean(body.isPublished);
      if (safeDescription !== undefined) item.description = safeDescription;
      if (safeColors !== undefined) item.colors = safeColors;
      if (safeSizes !== undefined) item.sizes = safeSizes;
      // Allow dashboard SKU override if provided
      if (body.sku && typeof body.sku === 'string') item.sku = body.sku.toUpperCase().trim();
      item.marketplaceSeo = buildMarketplaceProductSeo(item, user);
      await item.save();
    } else {
      const sku = (body.sku && typeof body.sku === 'string')
        ? body.sku.toUpperCase().trim()
        : await generateUniqueSku(user._id);

      const newProduct = {
        user: user._id,
        name: safeName.toLowerCase(),
        sku,
        quantity: safeStock !== undefined ? safeStock : 0,
        lastUnitPrice: safePrice !== undefined ? safePrice : 0,
        costPrice: safeCostPrice !== undefined ? safeCostPrice : 0,
        image: imageUrl || undefined,
        category: safeCategory?.toLowerCase(),
        barcode: safeBarcode,
        isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : true,
        description: safeDescription,
        colors: safeColors || [],
        sizes: safeSizes || [],
      };

      item = await Inventory.create({
        ...newProduct,
        marketplaceSeo: buildMarketplaceProductSeo(newProduct, user),
      });
    }

    return res.json({
      id: item._id,
      name: item.name,
      sku: item.sku || null,
      stock: item.quantity,
      price: item.lastUnitPrice,
      costPrice: item.costPrice,
      image: item.image,
      category: item.category,
      barcode: item.barcode,
      isPublished: item.isPublished !== false,
      description: item.description || '',
      colors: item.colors || [],
      sizes: item.sizes || [],
      boosts: formatActiveBoosts(item.boosts),
    });
  } catch (error) {
    console.error('Add Item Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// UPDATE an inventory item
export const updateInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const safeStock = validateNumber(body.stock);
    const safePrice = validateNumber(body.price);
    const safeCostPrice = validateNumber(body.costPrice);
    let imageUrl: string | undefined | null;

    // SSRF FIX: Only allow trusted R2 URL or Base64
    const trustedUrl = process.env.R2_PUBLIC_URL || 'https://cdn.tallypadi.com';
    
    if (typeof body.image === 'string') {
        if (body.image.startsWith('data:image/')) {
            imageUrl = saveImageFromBase64(body.image);
        } else if (body.image.startsWith(trustedUrl)) {
             imageUrl = body.image;
        } else {
             imageUrl = null; 
        }
    } else {
      imageUrl = null;
    }

    const safeCategory = sanitizeString(body.category);
    const safeBarcode = sanitizeString(body.barcode);

    // ── Restock Alert fields ──
    const safeLowStockThreshold = body.lowStockThreshold !== undefined ? validateNumber(body.lowStockThreshold) : undefined;
    const safeSupplierName = sanitizeString(body.supplierName);
    const safeSupplierPhone = sanitizeString(body.supplierPhone);

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    const item = await Inventory.findOne({ _id: id, user: user._id });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (safeStock !== undefined) item.quantity = safeStock;
    if (safePrice !== undefined) item.lastUnitPrice = safePrice;
    if (safeCostPrice !== undefined) item.costPrice = safeCostPrice;
    if (imageUrl) item.image = imageUrl;
    if (safeCategory !== undefined) item.category = safeCategory?.toLowerCase();
    if (safeBarcode !== undefined) item.barcode = safeBarcode;
    // Allow dashboard SKU editing
    if (body.sku && typeof body.sku === 'string') item.sku = body.sku.toUpperCase().trim();

    // ── Restock Alert fields ──
    if (safeLowStockThreshold !== undefined) item.lowStockThreshold = safeLowStockThreshold ?? undefined;
    if (safeSupplierName !== undefined) item.supplierName = safeSupplierName;
    if (safeSupplierPhone !== undefined) item.supplierPhone = safeSupplierPhone;

    // ── Marketplace fields ──
    if (body.isPublished !== undefined) item.isPublished = Boolean(body.isPublished);
    if (body.description !== undefined) item.description = sanitizeString(body.description);
    if (Array.isArray(body.colors)) item.colors = sanitizeStringArray(body.colors) || [];
    if (Array.isArray(body.sizes)) item.sizes = sanitizeStringArray(body.sizes) || [];
    item.marketplaceSeo = buildMarketplaceProductSeo(item, user);

    await item.save();

    return res.json({
      id: item._id,
      name: item.name,
      sku: item.sku || null,
      stock: item.quantity,
      price: item.lastUnitPrice,
      costPrice: item.costPrice,
      image: item.image,
      category: item.category,
      barcode: item.barcode,
      lowStockThreshold: item.lowStockThreshold,
      supplierName: item.supplierName,
      supplierPhone: item.supplierPhone,
      isPublished: item.isPublished !== false,
      description: item.description,
      colors: item.colors,
      sizes: item.sizes,
      boosts: formatActiveBoosts(item.boosts),
    });
  } catch (error) {
    console.error('Update Item Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};


// BULK UPDATE (e.g. for cost prices)
export const bulkUpdateInventory = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const updates = Array.isArray(body.updates) ? body.updates : [];

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    if (updates.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    const operations = updates.map((u: { id: string, costPrice: number }) => {
      const safeCost = validateNumber(u.costPrice);
      const update: Record<string, unknown> = {};
      if (safeCost !== undefined) update.costPrice = safeCost;

      return {
        updateOne: {
          filter: { _id: u.id, user: user._id },
          update: { $set: update },
        },
      };
    });

    if (operations.length > 0) {
      await Inventory.bulkWrite(operations);
    }

    return res.json({ success: true, count: operations.length });
  } catch (error) {
    console.error('Bulk Update Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

import { r2Service } from '../services/r2.service';

// ... (existing imports)

// IMPORT INVENTORY (CSV/JSON)
export const importInventory = async (req: Request, res: Response) => {
  // ... (existing code)
};

// DELETE an inventory item
export const deleteInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    const item = await Inventory.findOne({ _id: id, user: user._id });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // ✅ Delete image from R2 if exists
    if (item.image) {
       await r2Service.deleteFile(item.image);
    }

    await item.deleteOne();

    return res.json({ success: true, id });
  } catch (error) {
    console.error('Delete Item Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// =========================================================
// ✅ BULK AI UPLOAD ENDPOINTS
// =========================================================

export const bulkParseInventory = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const isTycoon = String(user.planType || '').toUpperCase() === 'TYCOON';
    if (!isTycoon) {
      return res.status(403).json({ error: 'Bulk AI Upload is a Tycoon-only feature.' });
    }

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text input is required' });
    }

    const promptText = `Add these to inventory:\n${text}`;
    const parsed = await parseMessageWithGemini(promptText, user.settings?.language || 'English');

    let items = parsed.items || [];
    if (items.length > 20) {
      items = items.slice(0, 20);
    }

    return res.json({ success: true, items });
  } catch (error) {
    console.error('Bulk Parse Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const bulkSaveInventory = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const isTycoon = String(user.planType || '').toUpperCase() === 'TYCOON';
    if (!isTycoon) {
      return res.status(403).json({ error: 'Bulk AI Upload is a Tycoon-only feature.' });
    }

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let updatedCount = 0;
    let createdCount = 0;

    for (const item of items) {
      const name = String(item.name || '').trim();
      const qty = Number(item.qty) || 0;
      const costPrice = Number(item.cost_price) || 0;
      const sellingPrice = Number(item.unit_price) || 0;

      if (!name) continue;

      const existingItem = await Inventory.findOne({
        user: user._id,
        name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
      });

      if (existingItem) {
        existingItem.quantity = Number(existingItem.quantity || 0) + qty;
        if (costPrice > 0) existingItem.costPrice = costPrice;
        if (sellingPrice > 0) existingItem.lastUnitPrice = sellingPrice;
        existingItem.marketplaceSeo = buildMarketplaceProductSeo(existingItem, user);
        await existingItem.save();
        updatedCount++;
      } else {
        const sku = await generateUniqueSku(user._id);
        const newProduct = {
          user: user._id,
          name,
          sku,
          quantity: qty,
          lastUnitPrice: sellingPrice,
          costPrice: costPrice,
        };
        await Inventory.create({
          ...newProduct,
          marketplaceSeo: buildMarketplaceProductSeo(newProduct, user),
        });
        createdCount++;
      }
    }

    return res.json({ success: true, updatedCount, createdCount });
  } catch (error) {
    console.error('Bulk Save Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};
