import { Request, Response } from 'express';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';

// --- Security Helpers ---

const sanitizeString = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  return input.trim();
};

const validateNumber = (input: unknown): number | undefined => {
  if (typeof input === 'number' && !isNaN(input)) return input;
  return undefined;
};

// --- Subscription Guard ---

/**
 * Returns true if the user can access inventory write features.
 * - active => allowed
 * - trial => allowed only before trialEndsAt
 */
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

// --- Controller Methods ---

// GET all inventory items
export const getInventory = async (req: Request, res: Response) => {
  try {
    /**
     * ✅ Replace this mock auth with your real auth user:
     * const userId = (req as any).user?.id;
     * const user = await User.findById(userId);
     */
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const items = await Inventory.find({ user: user._id });

    const formattedItems = items.map((item) => ({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice || 0,
    }));

    res.json(formattedItems);
  } catch (error) {
    console.error('Inventory Fetch Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// ADD a new inventory item
export const addInventoryItem = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    const safeName = sanitizeString(body.name);
    const safeStock = validateNumber(body.stock);
    const safePrice = validateNumber(body.price);

    /**
     * ✅ Replace this mock auth with your real auth user:
     * const userId = (req as any).user?.id;
     * const user = await User.findById(userId);
     */
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Enforce Trial/Active access
    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    if (!safeName) {
      return res.status(400).json({ error: 'Item name is required and must be a string' });
    }

    // Create or Update
    let item = await Inventory.findOne({ user: user._id, name: safeName.toLowerCase() });

    if (item) {
      const stockToAdd = safeStock !== undefined ? safeStock : 0;
      item.quantity += stockToAdd;

      if (safePrice !== undefined) item.lastUnitPrice = safePrice;
      await item.save();
    } else {
      item = await Inventory.create({
        user: user._id,
        name: safeName.toLowerCase(),
        quantity: safeStock !== undefined ? safeStock : 0,
        lastUnitPrice: safePrice !== undefined ? safePrice : 0,
      });
    }

    res.json({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice,
    });
  } catch (error) {
    console.error('Add Item Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// UPDATE an inventory item
export const updateInventoryItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const safeStock = validateNumber(body.stock);
    const safePrice = validateNumber(body.price);

    /**
     * ✅ Replace this mock auth with your real auth user:
     * const userId = (req as any).user?.id;
     * const user = await User.findById(userId);
     */
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Enforce Trial/Active access
    if (!hasInventoryWriteAccess(user)) {
      return denySubscription(res, user);
    }

    const item = await Inventory.findOne({ _id: id, user: user._id });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (safeStock !== undefined) item.quantity = safeStock;
    if (safePrice !== undefined) item.lastUnitPrice = safePrice;

    await item.save();

    res.json({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice,
    });
  } catch (error) {
    console.error('Update Item Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};
