import { Request, Response } from 'express';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import { saveImageFromBase64 } from '../utils/image';

// --- Helpers ---
const sanitizeString = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  return input.trim();
};

const validateNumber = (input: unknown): number | undefined => {
  const n = typeof input === 'string' ? Number(input) : (input as any);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

// --- Subscription Guard ---
const hasInventoryWriteAccess = (user: any): boolean => {
  if (!user) return false;

  if (user.subscriptionStatus === 'active') return true;

  if (user.subscriptionStatus === 'trial') {
    const trialEndsAtMs = new Date(user.trialEndsAt).getTime();
    if (!Number.isFinite(trialEndsAtMs)) return false;
    return Date.now() < trialEndsAtMs;
  }

  return false;
};

const denySubscription = (res: Response, user: any) => {
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
  const userId = (req as any).user?.id || (req as any).user?.userId || (req as any).userId;
  if (!userId) return null;
  return await User.findById(userId);
};

// GET all inventory items
export const getInventory = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const items = await Inventory.find({ user: user._id }).lean();

    const formattedItems = (items || []).map((item: any) => ({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice || 0,
      costPrice: item.costPrice || 0,
      image: item.image || null,
    }));

    return res.json(formattedItems);
  } catch (error) {
    console.error('Inventory Fetch Error:', error);
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
      stock: item.quantity,
      quantity: item.quantity,
      price: item.lastUnitPrice || 0,
      lastUnitPrice: item.lastUnitPrice || 0,
      costPrice: item.costPrice || 0,
      image: item.image || null,
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
    const imageUrl = saveImageFromBase64(body.image);
    const safeName = sanitizeString(body.name);

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
      await item.save();
    } else {
      item = await Inventory.create({
        user: user._id,
        name: safeName.toLowerCase(),
        quantity: safeStock !== undefined ? safeStock : 0,
        lastUnitPrice: safePrice !== undefined ? safePrice : 0,
        costPrice: safeCostPrice !== undefined ? safeCostPrice : 0,
        image: imageUrl || undefined,
      });
    }

    return res.json({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice,
      costPrice: item.costPrice,
      image: item.image,
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
    const imageUrl = saveImageFromBase64(body.image);

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

    await item.save();

    return res.json({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice,
      costPrice: item.costPrice,
      image: item.image,
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

    const operations = updates.map((u: any) => {
      const safeCost = validateNumber(u.costPrice);
      const update: any = {};
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

// IMPORT INVENTORY (CSV/JSON)
export const importInventory = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    if (items.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    const operations = items.map((item: any) => {
      const name = sanitizeString(item.name);
      if (!name) return null;

      const stock = validateNumber(item.stock);
      const price = validateNumber(item.price);
      const cost = validateNumber(item.costPrice);

      const updateFields: any = {};
      if (stock !== undefined) updateFields.quantity = stock;
      if (price !== undefined) updateFields.lastUnitPrice = price;
      if (cost !== undefined) updateFields.costPrice = cost;

      return {
        updateOne: {
          filter: { user: user._id, name: name.toLowerCase() },
          update: { 
            $set: updateFields,
            $setOnInsert: { user: user._id, name: name.toLowerCase() }
          },
          upsert: true,
        },
      };
    }).filter(Boolean);

    if (operations.length > 0) {
      await Inventory.bulkWrite(operations);
    }

    return res.json({ success: true, count: operations.length });
  } catch (error) {
    console.error('Import Inventory Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};