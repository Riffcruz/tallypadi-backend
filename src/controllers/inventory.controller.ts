import { Request, Response } from 'express';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';

// --- Security Helpers ---

/**
 * Validates that the input is a valid string.
 * Returns the trimmed string or null if invalid.
 */
const sanitizeString = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    return input.trim();
};

/**
 * Strictly checks for number type.
 * Returns undefined if not a valid number (NaN or non-number).
 */
const validateNumber = (input: unknown): number | undefined => {
    if (typeof input === 'number' && !isNaN(input)) return input;
    return undefined;
};

// --- Controller Methods ---

// GET all inventory items
export const getInventory = async (req: Request, res: Response) => {
  try {
    // In a real app, use req.user.id from JWT middleware
    // For now, we grab the first user or mock authentication
    const user = await User.findOne(); 
    if (!user) return res.status(404).json({ error: "User not found" });

    const items = await Inventory.find({ user: user._id });

    // Format for frontend
    const formattedItems = items.map(item => ({
      id: item._id,
      name: item.name,
      stock: item.quantity,
      price: item.lastUnitPrice || 0
    }));

    res.json(formattedItems);
  } catch (error) {
    console.error("Inventory Fetch Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// ADD a new inventory item
export const addInventoryItem = async (req: Request, res: Response) => {
  try {
    // Safe body reference
    const body = req.body || {};

    // Security: Validate inputs strictly
    const safeName = sanitizeString(body.name);
    const safeStock = validateNumber(body.stock);
    const safePrice = validateNumber(body.price);
    
    // Mock Auth
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!safeName) {
        return res.status(400).json({ error: "Item name is required and must be a string" });
    }

    // Create or Update
    // Note: We use the sanitized safeName here
    let item = await Inventory.findOne({ user: user._id, name: safeName.toLowerCase() });
    
    if (item) {
        // Update existing
        // Use 0 if stock is undefined, ensuring math doesn't break
        const stockToAdd = safeStock !== undefined ? safeStock : 0;
        item.quantity += stockToAdd;
        
        if (safePrice !== undefined) item.lastUnitPrice = safePrice;
        await item.save();
    } else {
        // Create new
        item = await Inventory.create({
            user: user._id,
            name: safeName.toLowerCase(),
            quantity: safeStock !== undefined ? safeStock : 0,
            lastUnitPrice: safePrice !== undefined ? safePrice : 0
        });
    }

    res.json({
        id: item._id,
        name: item.name,
        stock: item.quantity,
        price: item.lastUnitPrice
    });

  } catch (error) {
    console.error("Add Item Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// UPDATE an inventory item
export const updateInventoryItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        
        // Security: Validate inputs strictly
        const safeStock = validateNumber(body.stock);
        const safePrice = validateNumber(body.price);
        
        // Mock Auth
        const user = await User.findOne();
        if (!user) return res.status(404).json({ error: "User not found" });

        const item = await Inventory.findOne({ _id: id, user: user._id });

        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }

        // Only update if the values were valid numbers provided in the request
        if (safeStock !== undefined) item.quantity = safeStock;
        if (safePrice !== undefined) item.lastUnitPrice = safePrice;

        await item.save();

        res.json({
            id: item._id,
            name: item.name,
            stock: item.quantity,
            price: item.lastUnitPrice
        });

    } catch (error) {
        console.error("Update Item Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};