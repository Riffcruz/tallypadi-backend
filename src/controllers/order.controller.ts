import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { User } from '../models/user.model';

export const createOrder = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      description,
      customerName,
      customerPhone,
      price,
      amountPaid,
      deliveryDate,
      status
    } = req.body;

    if (!description || !customerName || !price || !deliveryDate) {
      return res.status(400).json({ 
        error: "Missing required fields",
        required: ["description", "customerName", "price", "deliveryDate"]
      });
    }

    const order = await orderService.createOrder(userId, {
      description,
      customerName,
      customerPhone,
      price,
      amountPaid: amountPaid || 0,
      deliveryDate: new Date(deliveryDate),
      status
    });

    res.json({ success: true, order });
  } catch (error: any) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Server Error", details: error.message });
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
