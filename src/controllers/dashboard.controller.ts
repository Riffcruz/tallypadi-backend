import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
// import { getTodayRangeForOffset } from '../utils/dates'; // Keep if you have this file

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    // ---------------------------------------------------------
    // 1. IDENTIFY USER (Mock Auth for MVP)
    // ---------------------------------------------------------
    // In a real app, this comes from req.user.id (JWT)
    const user = await User.findOne(); 
    
    if (!user) {
        return res.status(404).json({ error: "No user found. Please chat with the bot first!" });
    }

    // ---------------------------------------------------------
    // 2. FETCH INVENTORY (Bar Chart Data)
    // ---------------------------------------------------------
    const inventoryDocs = await Inventory.find({ user: user._id });
    const inventory = inventoryDocs.map(doc => ({
        name: doc.name,
        quantity: doc.quantity,
        price: doc.lastUnitPrice || 0 
    }));

    // ---------------------------------------------------------
    // 3. FETCH RECENT TRANSACTIONS (Table Data)
    // ---------------------------------------------------------
    const transactionDocs = await Transaction.find({ user: user._id })
      .sort({ timestamp: -1 }) // Newest first
      .limit(10);

    const transactions = transactionDocs.map(t => ({
        id: t._id,
        type: t.type, // 'SALE' or 'RESTOCK'
        item: t.items.map(i => i.name).join(', '), // "Rice, Beans"
        qty: t.items.reduce((acc, i) => acc + i.qty, 0), // Total items count
        amount: t.totalMoney || 0,
        date: t.timestamp.toISOString().split('T')[0] // YYYY-MM-DD
    }));

    // ---------------------------------------------------------
    // 4. CALCULATE TOTALS (Scorecards)
    // ---------------------------------------------------------
    const totalRevenueAgg = await Transaction.aggregate([
      { $match: { user: user._id, type: 'SALE' } },
      { $group: { _id: null, total: { $sum: "$totalMoney" } } }
    ]);

    const totalItemsSoldAgg = await Transaction.aggregate([
      { $match: { user: user._id, type: 'SALE' } },
      { $unwind: "$items" },
      { $group: { _id: null, total: { $sum: "$items.qty" } } }
    ]);

    // ---------------------------------------------------------
    // 5. GENERATE SALES GRAPH DATA (Line Chart)
    // ---------------------------------------------------------
    const salesGraph = await Transaction.aggregate([
      { 
        $match: { 
            user: user._id, 
            type: 'SALE',
            // Get data for last 30 days roughly
            timestamp: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) }
        } 
      },
      {
        $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            sales: { $sum: "$totalMoney" }
        }
      },
      { $sort: { _id: 1 } }, // Sort by date ascending
      { $limit: 7 } // Just show last 7 active days for clarity
    ]);

    // Format graph data for Recharts (name = day, sales = value)
    const graphData = salesGraph.map(g => ({
        name: g._id.split('-')[2], // Just the day number (e.g., "04")
        sales: g.sales
    }));

    // ---------------------------------------------------------
    // 6. SEND RESPONSE
    // ---------------------------------------------------------
    res.json({
      user: {
        name: user.name || "Shop Owner",
        shopName: user.businessName || "My Store",
        initials: user.businessName ? user.businessName.slice(0,2).toUpperCase() : "IO",
        planType: user.planType, // 🟢 FIXED: Now passing the planType to frontend
        settings: user.settings
      },
      stats: {
        revenue: totalRevenueAgg[0]?.total || 0,
        itemsSold: totalItemsSoldAgg[0]?.total || 0,
        stockValue: 0 // Placeholder until cost price is tracked
      },
      inventory,
      transactions,
      graphData
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};