// src/services/order.service.ts
import { Types } from 'mongoose';
import { Order, IOrder, ORDER_STATUSES, OrderStatus } from '../models/order.model';
import { startOfDay, endOfDay, addDays } from 'date-fns';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CreateOrderDto = {
  description: string;
  customerName: string;
  customerPhone?: string | null;
  price: number;
  amountPaid?: number;
  deliveryDate: Date;
  status?: OrderStatus;
};

type OrderFilters = {
  status?: OrderStatus;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  limit?: number;
};

type UpdateOrderDto = {
  description?: string;
  customerName?: string;
  customerPhone?: string | null;
  price?: number;
  amountPaid?: number;
  deliveryDate?: Date;
  status?: OrderStatus;
};

export class OrderService {
  /**
   * Create a new order
   */
  async createOrder(userId: string | Types.ObjectId, data: CreateOrderDto): Promise<IOrder> {
    // Safety: ensure status is valid if provided
    if (data.status && !(ORDER_STATUSES as readonly string[]).includes(data.status)) {
      throw new Error('Invalid status');
    }

    const price = Number(data.price);
    const paid = Number(data.amountPaid ?? 0);

    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid price');
    if (!Number.isFinite(paid) || paid < 0) throw new Error('Invalid amountPaid');
    if (paid > price) throw new Error('amountPaid cannot exceed price');

    const order = new Order({
      user: userId,
      description: data.description,
      customerName: data.customerName,
      customerPhone: data.customerPhone ?? null,
      price,
      amountPaid: paid,
      deliveryDate: data.deliveryDate,
      status: data.status,
      // balance is computed in model middleware too; keep it consistent:
      balance: Math.max(0, price - paid),
    });

    return await order.save();
  }

  /**
   * Get orders for a user with optional filters
   */
  async getOrders(userId: string | Types.ObjectId, filters: OrderFilters) {
    const query: Record<string, unknown> = { user: userId };

    if (filters.status) query.status = filters.status;

    if (filters.startDate || filters.endDate) {
      query.deliveryDate = {};
      if (filters.startDate) (query.deliveryDate as Record<string, unknown>).$gte = startOfDay(filters.startDate);
      if (filters.endDate) (query.deliveryDate as Record<string, unknown>).$lte = endOfDay(filters.endDate);
    }

    if (filters.search) {
      // double-safety: escape again even if controller already did
      const safe = escapeRegExp(String(filters.search).slice(0, 100));
      const regex = new RegExp(safe, 'i');
      query.$or = [{ description: regex }, { customerName: regex }];
    }

    const page = clamp(Number(filters.page ?? 1) || 1, 1, 1_000_000);
    const limit = clamp(Number(filters.limit ?? 20) || 20, 1, 100);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ deliveryDate: 1 })
        .skip(skip)
        .limit(limit)
        .lean(), // faster list response
      Order.countDocuments(query),
    ]);

    return {
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single order by ID
   */
  async getOrder(userId: string | Types.ObjectId, orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) return null;

    return await Order.findOne({
      _id: new Types.ObjectId(orderId),
      user: userId,
    });
  }

  /**
   * Update an order (whitelisted DTO)
   */
  async updateOrder(userId: string | Types.ObjectId, orderId: string, updates: UpdateOrderDto) {
    if (!Types.ObjectId.isValid(orderId)) return null;

    const order = await Order.findOne({
      _id: new Types.ObjectId(orderId),
      user: userId,
    });

    if (!order) return null;

    // Apply only whitelisted fields
    if (updates.price !== undefined) {
      if (!Number.isFinite(updates.price) || updates.price < 0) throw new Error('Invalid price');
      order.price = updates.price;
    }

    if (updates.amountPaid !== undefined) {
      if (!Number.isFinite(updates.amountPaid) || updates.amountPaid < 0) throw new Error('Invalid amountPaid');
      order.amountPaid = updates.amountPaid;
    }

    // block overpayment
    if (order.amountPaid > order.price) throw new Error('amountPaid cannot exceed price');

    if (updates.description !== undefined) order.description = updates.description;
    if (updates.customerName !== undefined) order.customerName = updates.customerName;
    if (updates.customerPhone !== undefined) order.customerPhone = updates.customerPhone;
    if (updates.deliveryDate !== undefined) order.deliveryDate = updates.deliveryDate;

    if (updates.status !== undefined) {
      if (!(ORDER_STATUSES as readonly string[]).includes(updates.status)) throw new Error('Invalid status');
      order.status = updates.status;
    }

    // balance will be recalculated by schema hook, but safe to keep consistent:
    order.balance = Math.max(0, order.price - Math.min(order.amountPaid, order.price));

    return await order.save();
  }

  /**
   * Delete an order
   */
  async deleteOrder(userId: string | Types.ObjectId, orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) return null;

    return await Order.findOneAndDelete({
      _id: new Types.ObjectId(orderId),
      user: userId,
    });
  }

  /**
   * Find orders due in 'days' days that haven't had a reminder sent
   */
  async getOrdersDueForReminder(days: number) {
    const targetDateStart = startOfDay(addDays(new Date(), days));
    const targetDateEnd = endOfDay(addDays(new Date(), days));

    return await Order.find({
      deliveryDate: { $gte: targetDateStart, $lte: targetDateEnd },
      reminderSent: false,
      status: { $in: ['PENDING', 'IN_PROGRESS'] },
    })
      .populate({
        path: 'user',
        select: '_id phone fullName email language utcOffsetMinutes', // ✅ avoid leaking password/hash etc
      });
  }
}

export const orderService = new OrderService();
