// src/controllers/order.controller.ts
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { orderService } from '../services/order.service';

// If you already exported these from your model, prefer importing them instead:
// import { ORDER_STATUSES, OrderStatus } from '../models/order.model';

type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
] as const;

type AuthedReq = Request & { user?: { id?: string; _id?: string } };

const normalizeStatus = (s: any): OrderStatus | undefined => {
  if (!s) return undefined;
  const up = String(s).toUpperCase().trim();
  return (ORDER_STATUSES as readonly string[]).includes(up) ? (up as OrderStatus) : undefined;
};

const normalizeText = (v: any, max = 500): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
};

const normalizePhone = (v: any): string | null | undefined => {
  if (v === undefined) return undefined; // not provided
  if (v === null) return null; // explicit null

  const s = String(v).trim();
  if (!s) return null;

  // allows +234..., 080..., spaces/hyphens/() - flexible
  if (!/^[+]?[\d\s\-()]{7,32}$/.test(s)) return undefined; // invalid
  return s;
};

const normalizeMoney = (v: any): number | undefined => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return undefined;
  if (n < 0) return undefined;
  // optional cap to block nonsense
  if (n > 1_000_000_000) return undefined;
  return n;
};

const parseDate = (v: any): Date | undefined => {
  if (v == null) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const toInt = (v: any, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getUserId = (req: AuthedReq) => req.user?.id || req.user?._id;

export const createOrder = async (req: AuthedReq, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const description = normalizeText(req.body?.description, 500);
    const customerName = normalizeText(req.body?.customerName, 120);
    const customerPhone = normalizePhone(req.body?.customerPhone);
    const price = normalizeMoney(req.body?.price);
    const amountPaid = normalizeMoney(req.body?.amountPaid) ?? 0;
    const deliveryDate = parseDate(req.body?.deliveryDate);
    const status = normalizeStatus(req.body?.status);

    if (!description || !customerName || price === undefined || !deliveryDate) {
      return res.status(400).json({
        error: 'Missing/invalid required fields',
        required: ['description', 'customerName', 'price (number)', 'deliveryDate (valid date)'],
      });
    }

    // If phone was provided but invalid => customerPhone === undefined
    if (req.body?.customerPhone !== undefined && customerPhone === undefined) {
      return res.status(400).json({ error: 'Invalid customerPhone' });
    }

    // Optional: block overpayment (or allow and let model clamp balance)
    if (amountPaid > price) {
      return res.status(400).json({ error: 'amountPaid cannot exceed price' });
    }

    const order = await orderService.createOrder(userId, {
      description,
      customerName,
      customerPhone: customerPhone ?? undefined, // null or string or undefined
      price,
      amountPaid,
      deliveryDate,
      status,
    });

    return res.json({ success: true, order });
  } catch (error: any) {
    console.error('Create Order Error:', error);
    return res.status(500).json({ error: 'Server Error', details: error?.message });
  }
};

export const getOrders = async (req: AuthedReq, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = normalizeStatus((req.query as any)?.status);
    const startDate = parseDate((req.query as any)?.startDate);
    const endDate = parseDate((req.query as any)?.endDate);

    if ((req.query as any)?.status && !status) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if ((req.query as any)?.startDate && !startDate) {
      return res.status(400).json({ error: 'Invalid startDate' });
    }
    if ((req.query as any)?.endDate && !endDate) {
      return res.status(400).json({ error: 'Invalid endDate' });
    }
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'startDate cannot be after endDate' });
    }

    const page = clamp(toInt((req.query as any)?.page, 1), 1, 1_000_000);
    const limit = clamp(toInt((req.query as any)?.limit, 20), 1, 100);

    const rawSearch = normalizeText((req.query as any)?.search, 100);
    const search = rawSearch ? escapeRegExp(rawSearch) : undefined; // ✅ avoid regex injection

    const result = await orderService.getOrders(userId, {
      status,
      startDate,
      endDate,
      search,
      page,
      limit,
    });

    return res.json(result);
  } catch (error: any) {
    console.error('Get Orders Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const getOrder = async (req: AuthedReq, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = String(req.params?.id || '');
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await orderService.getOrder(userId, id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    return res.json(order);
  } catch (error: any) {
    console.error('Get Order Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const updateOrder = async (req: AuthedReq, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = String(req.params?.id || '');
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    // ✅ WHITELIST updates (no mass assignment)
    const updates: {
      description?: string;
      customerName?: string;
      customerPhone?: string | null;
      price?: number;
      amountPaid?: number;
      deliveryDate?: Date;
      status?: OrderStatus;
    } = {};

    if ('description' in req.body) {
      const v = normalizeText(req.body.description, 500);
      if (!v) return res.status(400).json({ error: 'Invalid description' });
      updates.description = v;
    }

    if ('customerName' in req.body) {
      const v = normalizeText(req.body.customerName, 120);
      if (!v) return res.status(400).json({ error: 'Invalid customerName' });
      updates.customerName = v;
    }

    if ('customerPhone' in req.body) {
      const v = normalizePhone(req.body.customerPhone);
      if (req.body.customerPhone !== null && req.body.customerPhone !== '' && v === undefined) {
        return res.status(400).json({ error: 'Invalid customerPhone' });
      }
      updates.customerPhone = v ?? null;
    }

    if ('price' in req.body) {
      const v = normalizeMoney(req.body.price);
      if (v === undefined) return res.status(400).json({ error: 'Invalid price' });
      updates.price = v;
    }

    if ('amountPaid' in req.body) {
      const v = normalizeMoney(req.body.amountPaid);
      if (v === undefined) return res.status(400).json({ error: 'Invalid amountPaid' });
      updates.amountPaid = v;
    }

    if ('deliveryDate' in req.body) {
      const d = parseDate(req.body.deliveryDate);
      if (!d) return res.status(400).json({ error: 'Invalid deliveryDate' });
      updates.deliveryDate = d;
    }

    if ('status' in req.body) {
      const st = normalizeStatus(req.body.status);
      if (!st) return res.status(400).json({ error: 'Invalid status' });
      updates.status = st;
    }

    // If nothing to update
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Optional: block overpayment in updates when both fields are included
    if (updates.price !== undefined && updates.amountPaid !== undefined && updates.amountPaid > updates.price) {
      return res.status(400).json({ error: 'amountPaid cannot exceed price' });
    }

    const order = await orderService.updateOrder(userId, id, updates);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    return res.json({ success: true, order });
  } catch (error: any) {
    console.error('Update Order Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const deleteOrder = async (req: AuthedReq, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = String(req.params?.id || '');
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await orderService.deleteOrder(userId, id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    return res.json({ success: true, message: 'Order deleted' });
  } catch (error: any) {
    console.error('Delete Order Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};
