import { Request, Response } from 'express';
import { Customer } from '../models/customer.model';

const isValidPhone = (phone: string) => {
  const phoneRegex = /^\+?[\d\s\-\(\)]{7,15}$/;
  return phoneRegex.test(phone);
};

export const getCustomers = async (req: any, res: Response) => {
  try {
    const shopId = req.user.role === 'OWNER' ? req.user.id : req.user.ownerId;
    if (!shopId) return res.status(403).json({ error: 'Shop ID required' });

    const search = req.query.search?.toString();

    let query: any = { shopId };

    if (search) {
      // Basic regex search on name or phone
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 });

    res.json({ success: true, customers });
  } catch (error) {
    console.error('getCustomers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const createCustomer = async (req: any, res: Response) => {
  try {
    const shopId = req.user.role === 'OWNER' ? req.user.id : req.user.ownerId;
    if (!shopId) return res.status(403).json({ error: 'Shop ID required' });

    const { name, phoneNumber } = req.body;

    if (!name || !phoneNumber) {
      return res.status(400).json({ error: 'Name and phone number are required' });
    }

    if (!isValidPhone(phoneNumber)) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    // Check if phone already exists for THIS shop
    const existing = await Customer.findOne({ shopId, phoneNumber });
    if (existing) {
      return res.status(400).json({ error: 'A customer with this phone number already exists in your shop' });
    }

    const customer = await Customer.create({
      shopId,
      name,
      phoneNumber
    });

    res.status(201).json({ success: true, customer });
  } catch (error) {
    console.error('createCustomer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req: any, res: Response) => {
  try {
    const shopId = req.user.role === 'OWNER' ? req.user.id : req.user.ownerId;
    if (!shopId) return res.status(403).json({ error: 'Shop ID required' });

    const { id } = req.params;
    const { name, phoneNumber, royaltyPoints } = req.body;

    // Optional phone validation to ensure they aren't changing it to an existing one
    if (phoneNumber) {
      if (!isValidPhone(phoneNumber)) {
        return res.status(400).json({ error: 'Please enter a valid phone number' });
      }

      const existing = await Customer.findOne({ shopId, phoneNumber, _id: { $ne: id } });
      if (existing) return res.status(400).json({ error: 'Phone number already used by another customer' });
    }

    // Allow staff/owners to manually adjust points if there's a dispute
    const updatePayload: any = { name, phoneNumber };
    if (typeof royaltyPoints === 'number') {
        updatePayload.royaltyPoints = royaltyPoints;
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: id, shopId },
      { $set: updatePayload },
      { new: true }
    );

    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    res.json({ success: true, customer });
  } catch (error) {
    console.error('updateCustomer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const deleteCustomer = async (req: any, res: Response) => {
  try {
    const shopId = req.user.role === 'OWNER' ? req.user.id : req.user.ownerId;
    if (!shopId) return res.status(403).json({ error: 'Shop ID required' });

    const { id } = req.params;

    const customer = await Customer.findOneAndDelete({ _id: id, shopId });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    res.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    console.error('deleteCustomer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};
