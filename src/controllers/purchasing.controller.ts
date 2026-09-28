import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { Supplier } from '../models/supplier.model';
import { PurchaseOrder } from '../models/purchaseOrder.model';

const clean = (value: unknown, max = 500) => String(value || '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const purchaseReference = () => `PO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

const contextFor = async (req: Request) => {
  const id = req.user?.id;
  if (!id || !Types.ObjectId.isValid(id)) return null;
  const actor = await User.findById(id);
  if (!actor) return null;
  if (actor.role === 'STAFF' && !actor.isHqManager) return null;
  const ownerId = actor.role === 'STAFF' ? actor.ownerId : actor._id;
  return ownerId ? { actor, actorId: actor._id, ownerId: new Types.ObjectId(String(ownerId)) } : null;
};

const locationsFor = (ownerId: Types.ObjectId) => User.find({ $or: [{ _id: ownerId }, { hqId: ownerId, role: 'OWNER' }] })
  .select('_id businessName branchType city').sort({ branchType: -1, businessName: 1 }).lean();

const populatedOrders = (query: any) => query
  .populate('supplier', 'name phone email')
  .populate('destination', 'businessName branchType')
  .populate('createdBy', 'name businessName');

export const getPurchasingWorkspace = async (req: Request, res: Response) => {
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const locations = await locationsFor(context.ownerId);
    const locationIds = locations.map((entry) => entry._id);
    const [suppliers, orders, inventory] = await Promise.all([
      Supplier.find({ owner: context.ownerId, isArchived: { $ne: true } }).sort({ name: 1 }).lean(),
      populatedOrders(PurchaseOrder.find({ owner: context.ownerId }).sort({ createdAt: -1 }).limit(250)).lean(),
      Inventory.find({ user: { $in: locationIds }, isDeleted: { $ne: true } }).select('_id user name sku quantity costPrice lastUnitPrice category image barcode').sort({ name: 1 }).lean(),
    ]);
    const seen = new Set<string>();
    const catalog = inventory.filter((item) => {
      const key = item.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return res.json({ suppliers, orders, locations, catalog });
  } catch (error) {
    console.error('Purchasing Workspace Error:', error);
    return res.status(500).json({ error: 'Could not load purchasing.' });
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const name = clean(req.body?.name, 120);
    if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
    const supplier = await Supplier.create({ owner: context.ownerId, name, phone: clean(req.body?.phone, 40), email: clean(req.body?.email, 160).toLowerCase(), address: clean(req.body?.address, 300), notes: clean(req.body?.notes) });
    return res.status(201).json({ supplier });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A supplier with that name already exists.' });
    console.error('Create Supplier Error:', error);
    return res.status(500).json({ error: 'Could not create supplier.' });
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const name = clean(req.body?.name, 120);
    if (!Types.ObjectId.isValid(String(req.params.id)) || !name) return res.status(400).json({ error: 'Valid supplier and name are required.' });
    const supplier = await Supplier.findOneAndUpdate({ _id: String(req.params.id), owner: context.ownerId, isArchived: { $ne: true } }, { $set: { name, phone: clean(req.body?.phone, 40), email: clean(req.body?.email, 160).toLowerCase(), address: clean(req.body?.address, 300), notes: clean(req.body?.notes) } }, { new: true, runValidators: true });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });
    return res.json({ supplier });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A supplier with that name already exists.' });
    return res.status(500).json({ error: 'Could not update supplier.' });
  }
};

export const archiveSupplier = async (req: Request, res: Response) => {
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const supplier = await Supplier.findOneAndUpdate({ _id: String(req.params.id), owner: context.ownerId }, { $set: { isArchived: true } }, { new: true });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Could not archive supplier.' }); }
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const supplierId = String(req.body?.supplierId || '');
    const destinationId = String(req.body?.destinationId || '');
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!Types.ObjectId.isValid(supplierId) || !Types.ObjectId.isValid(destinationId) || rawItems.length < 1 || rawItems.length > 100) return res.status(400).json({ error: 'Supplier, destination, and at least one product are required.' });
    const locations = await locationsFor(context.ownerId);
    const locationIds = locations.map((entry) => String(entry._id));
    if (!locationIds.includes(destinationId)) return res.status(404).json({ error: 'Destination was not found under this account.' });
    const supplier = await Supplier.findOne({ _id: supplierId, owner: context.ownerId, isArchived: { $ne: true } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });

    const items = [] as Array<{ product: Types.ObjectId; name: string; orderedQty: number; receivedQty: number; unitCost: number }>;
    const used = new Set<string>();
    for (const raw of rawItems) {
      const productId = String(raw?.productId || '');
      const orderedQty = Number(raw?.quantity);
      const unitCost = Number(raw?.unitCost);
      if (!Types.ObjectId.isValid(productId) || !Number.isSafeInteger(orderedQty) || orderedQty < 1 || !Number.isFinite(unitCost) || unitCost < 0 || used.has(productId)) return res.status(400).json({ error: 'Every purchase item needs a unique product, whole quantity, and valid unit cost.' });
      const product = await Inventory.findOne({ _id: productId, user: { $in: locationIds }, isDeleted: { $ne: true } }).select('_id name');
      if (!product) return res.status(404).json({ error: 'One of the selected products was not found.' });
      used.add(productId); items.push({ product: product._id as Types.ObjectId, name: product.name, orderedQty, receivedQty: 0, unitCost });
    }
    const now = new Date();
    const submit = req.body?.submit !== false;
    const order = await PurchaseOrder.create({
      owner: context.ownerId, reference: purchaseReference(), supplier: supplier._id, destination: destinationId,
      status: submit ? 'ORDERED' : 'DRAFT', expectedAt: req.body?.expectedAt ? new Date(req.body.expectedAt) : null,
      notes: clean(req.body?.notes), items, subtotal: items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0),
      createdBy: context.actorId, orderedAt: submit ? now : null,
      events: [{ action: submit ? 'ORDERED' : 'DRAFT_CREATED', actor: context.actorId, at: now }],
    });
    return res.status(201).json({ order: await populatedOrders(PurchaseOrder.findById(order._id)).lean() });
  } catch (error) {
    console.error('Create Purchase Order Error:', error);
    return res.status(500).json({ error: 'Could not create purchase order.' });
  }
};

export const updatePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const action = clean(req.body?.action, 20).toUpperCase();
    const expected: Array<'DRAFT' | 'ORDERED'> = action === 'ORDER' ? ['DRAFT'] : ['DRAFT', 'ORDERED'];
    const next: 'ORDERED' | 'CANCELLED' | '' = action === 'ORDER' ? 'ORDERED' : action === 'CANCEL' ? 'CANCELLED' : '';
    if (!next) return res.status(400).json({ error: 'Invalid purchase-order action.' });
    const now = new Date();
    const order = await PurchaseOrder.findOneAndUpdate(
      { _id: String(req.params.id), owner: context.ownerId, status: { $in: expected } },
      { $set: { status: next, ...(action === 'ORDER' ? { orderedAt: now } : { cancelledAt: now }) }, $push: { events: { action: next, actor: context.actorId, at: now, note: clean(req.body?.note) } } },
      { new: true }
    );
    if (!order) return res.status(409).json({ error: 'Purchase order is not available for that action.' });
    return res.json({ order: await populatedOrders(PurchaseOrder.findById(order._id)).lean() });
  } catch { return res.status(500).json({ error: 'Could not update purchase order.' }); }
};

export const receivePurchaseOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const context = await contextFor(req);
    if (!context) return res.status(403).json({ error: 'Purchasing access denied.' });
    const received = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!received.length) return res.status(400).json({ error: 'Enter at least one received quantity.' });
    let orderId: Types.ObjectId | null = null;
    await session.withTransaction(async () => {
      const order = await PurchaseOrder.findOne({ _id: String(req.params.id), owner: context.ownerId, status: { $in: ['ORDERED', 'PARTIALLY_RECEIVED'] } }).session(session);
      if (!order) throw Object.assign(new Error('Purchase order is not open for receiving.'), { status: 409 });
      const supplier = await Supplier.findById(order.supplier).session(session);
      if (!supplier) throw Object.assign(new Error('The supplier record no longer exists.'), { status: 409 });
      let receivedValue = 0;
      const transactionItems: Array<{ name: string; itemId: Types.ObjectId; qty: number; unit: string; unitPrice: number; costPrice: number; total: number }> = [];
      const receivedProducts = new Set<string>();
      for (const input of received) {
        const productId = String(input?.productId || '');
        const quantity = Number(input?.quantity);
        if (!Types.ObjectId.isValid(productId) || !Number.isSafeInteger(quantity) || quantity < 1 || receivedProducts.has(productId)) throw Object.assign(new Error('Received products must be unique with positive whole quantities.'), { status: 400 });
        const line = order.items.find((item) => String(item.product) === productId);
        if (!line || line.receivedQty + quantity > line.orderedQty) throw Object.assign(new Error('Received quantity exceeds the amount still due.'), { status: 409 });
        const template = await Inventory.findById(line.product).session(session);
        if (!template) throw Object.assign(new Error(`Product ${line.name} no longer exists.`), { status: 409 });
        let destination = await Inventory.findOne({ user: order.destination, name: line.name, isDeleted: { $ne: true } }).session(session);
        if (destination) {
          const oldQty = Number(destination.quantity || 0);
          destination.costPrice = oldQty + quantity > 0 ? ((oldQty * Number(destination.costPrice || 0)) + (quantity * line.unitCost)) / (oldQty + quantity) : line.unitCost;
          destination.quantity = oldQty + quantity;
          destination.supplierName = supplier.name;
          if (supplier.phone) destination.supplierPhone = supplier.phone;
          await destination.save({ session });
        } else {
          [destination] = await Inventory.create([{ user: order.destination, name: line.name, quantity, costPrice: line.unitCost, lastUnitPrice: template.lastUnitPrice, category: template.category, image: template.image, barcode: template.barcode, lowStockThreshold: template.lowStockThreshold, supplierName: supplier.name, supplierPhone: supplier.phone, isPublished: false }], { session });
        }
        line.receivedQty += quantity;
        receivedValue += quantity * line.unitCost;
        receivedProducts.add(productId);
        transactionItems.push({ name: line.name, itemId: destination._id as Types.ObjectId, qty: quantity, unit: '', unitPrice: line.unitCost, costPrice: line.unitCost, total: quantity * line.unitCost });
      }
      const complete = order.items.every((item) => item.receivedQty >= item.orderedQty);
      const now = new Date();
      order.status = complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      if (complete) order.receivedAt = now;
      order.events.push({ action: order.status, actor: context.actorId, at: now, note: clean(req.body?.note) });
      await order.save({ session });
      await Transaction.create([{ user: order.destination, type: 'RESTOCK', totalMoney: receivedValue, items: transactionItems, date: now.toISOString().slice(0, 10), timestamp: now, notes: `${order.reference} supplier delivery` }], { session });
      orderId = order._id as Types.ObjectId;
    });
    return res.json({ order: await populatedOrders(PurchaseOrder.findById(orderId)).lean() });
  } catch (error: any) {
    console.error('Receive Purchase Order Error:', error);
    if (/Transaction numbers are only allowed|replica set|mongos/i.test(String(error?.message || ''))) return res.status(503).json({ error: 'Safe purchase receiving requires MongoDB replica-set transactions. No stock was changed.' });
    return res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Could not receive purchase order.' });
  } finally { await session.endSession(); }
};
