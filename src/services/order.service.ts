import { Types } from 'mongoose';
import { Order, IOrder } from '../models/order.model';
import { User } from '../models/user.model';
import { startOfDay, endOfDay, addDays } from 'date-fns';

export class OrderService {
  /**
   * Create a new order
   */
  async createOrder(
    userId: string | Types.ObjectId,
    data: {
      description: string;
      customerName: string;
      customerPhone?: string;
      price: number;
      amountPaid?: number;
      deliveryDate: Date;
      status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
    }
  ): Promise<IOrder> {
    const order = new Order({
      user: userId,
      ...data,
      balance: data.price - (data.amountPaid || 0)
    });

    return await order.save();
  }

  /**
   * Get orders for a user with optional filters
   */
  async getOrders(
    userId: string | Types.ObjectId,
    filters: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const query: any = { user: userId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      query.deliveryDate = {};
      if (filters.startDate) query.deliveryDate.$gte = startOfDay(filters.startDate);
      if (filters.endDate) query.deliveryDate.$lte = endOfDay(filters.endDate);
    }

    if (filters.search) {
      const regex = new RegExp(filters.search, 'i');
      query.$or = [
        { description: regex },
        { customerName: regex }
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ deliveryDate: 1 }) // Sort by delivery date ascending (nearest first)
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    return {
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get a single order by ID
   */
  async getOrder(userId: string | Types.ObjectId, orderId: string) {
    return await Order.findOne({ 
      _id: orderId, 
      user: userId 
    });
  }

  /**
   * Update an order
   */
  async updateOrder(
    userId: string | Types.ObjectId, 
    orderId: string, 
    updates: Partial<IOrder>
  ) {
    const order = await Order.findOne({ 
      _id: orderId, 
      user: userId 
    });

    if (!order) return null;

    if (updates.price !== undefined) order.price = updates.price;
    if (updates.amountPaid !== undefined) order.amountPaid = updates.amountPaid;
    if (updates.description !== undefined) order.description = updates.description;
    if (updates.customerName !== undefined) order.customerName = updates.customerName;
    if (updates.customerPhone !== undefined) order.customerPhone = updates.customerPhone;
    if (updates.deliveryDate !== undefined) order.deliveryDate = updates.deliveryDate;
    if (updates.status !== undefined) order.status = updates.status;
    
    // Recalculate balance if price or amountPaid changed (handled by pre-save middleware but good to be explicit/safe)
    // Actually, middleware handles it:
    // orderSchema.pre('save', function (next) { ... })

    return await order.save();
  }

  /**
   * Delete an order
   */
  async deleteOrder(userId: string | Types.ObjectId, orderId: string) {
    return await Order.findOneAndDelete({ 
      _id: orderId, 
      user: userId 
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
      status: { $in: ['PENDING', 'IN_PROGRESS'] } // Only remind for active orders
    }).populate('user');
  }
}

export const orderService = new OrderService();
