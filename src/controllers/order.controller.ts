import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { User } from '../models/user.model';

// put this near the top of your controller file
type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';

const normalizeStatus = (s: any): OrderStatus | undefined => {
  if (!s) return undefined;

  const up = String(s).toUpperCase().trim();

  const allowed: readonly OrderStatus[] = [
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'DELIVERED',
    'CANCELLED',
  ] as const;

  return (allowed as readonly string[]).includes(up) ? (up as OrderStatus) : undefined;
};


const normalizeMoney = (v: any) => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
};


const parseDate = (v: any) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export const createOrder = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { description, customerName, customerPhone, price, amountPaid, deliveryDate, status } = req.body;

    const priceN = normalizeMoney(price);
    const paidN  = normalizeMoney(amountPaid) ?? 0;
    const dateD  = parseDate(deliveryDate);
    const st     = normalizeStatus(status);

    if (!description || !customerName || priceN == null || !dateD) {
      return res.status(400).json({
        error: "Missing/invalid required fields",
        required: ["description", "customerName", "price (number)", "deliveryDate (valid date)"],
      });
    }

    const order = await orderService.createOrder(userId, {
      description,
      customerName,
      customerPhone,
      price: priceN,
      amountPaid: paidN,
      deliveryDate: dateD,
      status: st,
    });

    return res.json({ success: true, order });
  } catch (error: any) {
    console.error("Create Order Error:", error);
    return res.status(500).json({ error: "Server Error", details: error.message });
  }
};


export const getOrders = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { status, startDate, endDate, search, page, limit } = req.query;

    const result = await orderService.getOrders(userId, {
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      search: search as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20
    });

    res.json(result);
  } catch (error: any) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

export const getOrder = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const order = await orderService.getOrder(userId, id);

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json(order);
  } catch (error: any) {
    console.error("Get Order Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

export const updateOrder = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const updates = req.body;

    if (updates.deliveryDate) {
        updates.deliveryDate = new Date(updates.deliveryDate);
    }

    const order = await orderService.updateOrder(userId, id, updates);

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true, order });
  } catch (error: any) {
    console.error("Update Order Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

export const deleteOrder = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const order = await orderService.deleteOrder(userId, id);

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true, message: "Order deleted" });
  } catch (error: any) {
    console.error("Delete Order Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};
