import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { DraftRestock } from '../models/draftRestock.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';

// --- SKU Generator (duplicated here to keep controller self-contained) ---
function generateSku(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `P-${code}`;
}

async function generateUniqueSku(userId: Types.ObjectId): Promise<string> {
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

// GET /api/draft/:id — Fetch a pending draft (no auth required, ID is secret)
export const getDraft = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id as string)) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const draft = await DraftRestock.findById(id).lean();
    if (!draft) return res.status(404).json({ error: 'Draft not found or has expired' });

    if (draft.status !== 'PENDING') {
      return res.status(410).json({ error: 'This draft has already been resolved' });
    }

    // Enrich each ambiguous item with the display names of options
    const enrichedItems = draft.items.map((item) => ({
      rawName: item.rawName,
      qty: item.qty,
      cost_price: item.cost_price,
      unit_price: item.unit_price,
      options: item.options, // existing product names
    }));

    return res.json({
      id: draft._id,
      successCount: draft.successCount,
      items: enrichedItems,
      createdAt: draft.createdAt,
    });
  } catch (error) {
    console.error('Get Draft Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// POST /api/draft/:id/resolve — User has made their choices; apply updates
// Body: { resolutions: [{ rawName, inventoryId | null, createNew }] }
export const resolveDraft = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolutions } = req.body || {};

    if (!Types.ObjectId.isValid(id as string)) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const draft = await DraftRestock.findById(id);
    if (!draft) return res.status(404).json({ error: 'Draft not found or has expired' });

    if (draft.status !== 'PENDING') {
      return res.status(410).json({ error: 'This draft has already been resolved' });
    }

    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ error: 'No resolutions provided' });
    }

    const userId = draft.user as Types.ObjectId;
    const resolvedNames: string[] = [];

    for (const resolution of resolutions) {
      const draftItem = draft.items.find((i) => i.rawName === resolution.rawName);
      if (!draftItem) continue;

      const qty = Number(draftItem.qty) || 0;
      const costPrice = Number(draftItem.cost_price) || 0;
      const unitPrice = Number(draftItem.unit_price) || 0;

      if (resolution.createNew) {
        // Create a brand new inventory item with the exact raw name
        const sku = await generateUniqueSku(userId);
        const newItem = await Inventory.create({
          user: userId,
          name: String(resolution.rawName || draftItem.rawName).toLowerCase().trim(),
          sku,
          quantity: qty,
          lastUnitPrice: unitPrice,
          costPrice: costPrice,
        });
        resolvedNames.push(newItem.name);
      } else if (resolution.inventoryId && Types.ObjectId.isValid(resolution.inventoryId)) {
        // Link to an existing item and increment its stock
        const inv = await Inventory.findOne({ _id: resolution.inventoryId, user: userId });
        if (inv) {
          inv.quantity = Number(inv.quantity || 0) + qty;
          if (costPrice > 0) inv.costPrice = costPrice;
          if (unitPrice > 0) inv.lastUnitPrice = unitPrice;
          await inv.save();
          resolvedNames.push(inv.name);
        }
      }
      // If neither, user chose to skip — that's okay, just move on
    }

    // Mark draft as resolved
    draft.status = 'RESOLVED';
    await draft.save();

    return res.json({
      success: true,
      resolvedCount: resolvedNames.length,
      resolvedItems: resolvedNames,
    });
  } catch (error) {
    console.error('Resolve Draft Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// GET /api/draft/:id/inventory — Returns inventory items for the draft owner
// (used by the draft UI to build dropdowns)
export const getDraftInventoryOptions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id as string)) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const draft = await DraftRestock.findById(id).lean();
    if (!draft) return res.status(404).json({ error: 'Draft not found or has expired' });

    // Return only the names from the options arrays (already curated fuzzy matches)
    // Plus also look up the actual inventory items by name to get their IDs
    const allOptionNames = [...new Set(draft.items.flatMap((i) => i.options))];

    const inventoryItems = await Inventory.find({
      user: draft.user,
      name: { $in: allOptionNames },
    })
      .select('_id name sku quantity lastUnitPrice')
      .lean();

    return res.json(
      inventoryItems.map((inv) => ({
        id: inv._id,
        name: inv.name,
        sku: inv.sku || null,
        stock: inv.quantity,
        price: inv.lastUnitPrice,
      }))
    );
  } catch (error) {
    console.error('Get Draft Inventory Options Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};
