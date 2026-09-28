import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { User, IUser } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { StockTransfer, StockTransferStatus } from '../models/stockTransfer.model';

const cleanText = (value: unknown, max = 500) => String(value || '')
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const getContext = async (req: Request) => {
  const actorId = (req as any).user?.id || (req as any).user?._id || (req as any).userId;
  if (!actorId || !Types.ObjectId.isValid(actorId)) return null;
  const actor = await User.findById(actorId);
  if (!actor) return null;
  const allowed = actor.role === 'HQ' || actor.role === 'OWNER' || (actor.role === 'STAFF' && actor.isHqManager);
  if (!allowed) return null;
  const hqId = actor.role === 'STAFF' ? actor.ownerId : actor._id;
  if (!hqId) return null;
  return { actor, actorId: actor._id, hqId: new Types.ObjectId(String(hqId)) };
};

const locationScope = (hqId: Types.ObjectId): Record<string, unknown> => ({
  $or: [{ _id: hqId }, { hqId, role: 'OWNER' }],
});

const getLocations = async (hqId: Types.ObjectId) => User.find(locationScope(hqId))
  .select('_id businessName branchType city address lastSeen subscriptionStatus')
  .sort({ branchType: -1, businessName: 1 })
  .lean();

const transferReference = () => `TRF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

const populateTransfer = (query: any) => query
  .populate('fromLocation', 'businessName branchType')
  .populate('toLocation', 'businessName branchType')
  .populate('requestedBy approvedBy dispatchedBy receivedBy cancelledBy', 'name businessName');

export const getStockHub = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    if (!context) return res.status(403).json({ error: 'Warehouse access denied.' });
    const locations = await getLocations(context.hqId);
    const locationIds = locations.map((location) => location._id);
    const search = cleanText(req.query.search, 100).toLowerCase();
    const locationId = cleanText(req.query.locationId, 40);
    const validLocation = !locationId || locationIds.some((id) => String(id) === locationId);
    if (!validLocation) return res.status(400).json({ error: 'Invalid location.' });

    const query: Record<string, unknown> = {
      user: locationId ? new Types.ObjectId(locationId) : { $in: locationIds },
      isDeleted: { $ne: true },
    };
    if (search) query.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const items = await Inventory.find(query)
      .select('user name sku barcode quantity lowStockThreshold costPrice lastUnitPrice category image')
      .sort({ name: 1 })
      .limit(1000)
      .lean();
    const locationMap = new Map(locations.map((location: any) => [String(location._id), location]));
    const inventory = items.map((item: any) => ({
      ...item,
      location: locationMap.get(String(item.user)),
      isLowStock: item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold,
    }));
    const pendingTransfers = await StockTransfer.countDocuments({
      hq: context.hqId,
      status: { $in: ['REQUESTED', 'APPROVED', 'DISPATCHED'] },
    });

    return res.json({
      locations,
      inventory,
      summary: {
        locations: locations.length,
        warehouses: locations.filter((location: any) => location.branchType === 'WAREHOUSE').length,
        units: inventory.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
        lowStock: inventory.filter((item: any) => item.isLowStock).length,
        pendingTransfers,
      },
    });
  } catch (error) {
    console.error('Stock Hub Error:', error);
    return res.status(500).json({ error: 'Could not load warehouse stock.' });
  }
};

export const listTransfers = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    if (!context) return res.status(403).json({ error: 'Warehouse access denied.' });
    const status = cleanText(req.query.status, 20).toUpperCase();
    const allowedStatuses: StockTransferStatus[] = ['REQUESTED', 'APPROVED', 'DISPATCHED', 'RECEIVED', 'CANCELLED', 'REJECTED'];
    const query: Record<string, unknown> = { hq: context.hqId };
    if (status && allowedStatuses.includes(status as StockTransferStatus)) query.status = status;
    const transfers = await populateTransfer(StockTransfer.find(query).sort({ createdAt: -1 }).limit(250)).lean();
    return res.json({ transfers });
  } catch (error) {
    console.error('List Stock Transfers Error:', error);
    return res.status(500).json({ error: 'Could not load transfers.' });
  }
};

export const createTransferRequest = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    if (!context) return res.status(403).json({ error: 'Warehouse access denied.' });
    const { fromLocationId, toLocationId, itemId } = req.body || {};
    const quantity = Number(req.body?.quantity);
    const note = cleanText(req.body?.note);
    if (![fromLocationId, toLocationId, itemId].every((id) => Types.ObjectId.isValid(String(id))) || !Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Choose valid locations, product, and quantity.' });
    }
    if (String(fromLocationId) === String(toLocationId)) return res.status(400).json({ error: 'Source and destination must be different.' });
    const [fromLocation, toLocation, item] = await Promise.all([
      User.findOne({ _id: fromLocationId, ...locationScope(context.hqId) }).select('businessName branchType'),
      User.findOne({ _id: toLocationId, ...locationScope(context.hqId) }).select('businessName branchType'),
      Inventory.findOne({ _id: itemId, user: fromLocationId, isDeleted: { $ne: true } }),
    ]);
    if (!fromLocation || !toLocation) return res.status(404).json({ error: 'Location not found under this account.' });
    if (!item) return res.status(404).json({ error: 'Product was not found at the source location.' });
    if (item.quantity < quantity) return res.status(409).json({ error: `Only ${item.quantity} units are currently available.` });

    const transfer = await StockTransfer.create({
      hq: context.hqId,
      reference: transferReference(),
      fromLocation: fromLocation._id,
      toLocation: toLocation._id,
      item: item._id,
      itemName: item.name,
      quantity,
      status: 'REQUESTED',
      note,
      requestedBy: context.actorId,
      events: [{ action: 'REQUESTED', actor: context.actorId, at: new Date(), note }],
    });
    const result = await populateTransfer(StockTransfer.findById(transfer._id)).lean();
    return res.status(201).json({ transfer: result });
  } catch (error) {
    console.error('Create Stock Transfer Error:', error);
    return res.status(500).json({ error: 'Could not create the transfer request.' });
  }
};

export const updateTransferStatus = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const context = await getContext(req);
    if (!context) return res.status(403).json({ error: 'Warehouse access denied.' });
    const transferIdParam = String(req.params.id || '');
    if (!Types.ObjectId.isValid(transferIdParam)) return res.status(400).json({ error: 'Invalid transfer.' });
    const action = cleanText(req.body?.action, 20).toUpperCase();
    const note = cleanText(req.body?.note);
    const transitions: Record<string, { from: StockTransferStatus[]; to: StockTransferStatus }> = {
      APPROVE: { from: ['REQUESTED'], to: 'APPROVED' },
      REJECT: { from: ['REQUESTED'], to: 'REJECTED' },
      DISPATCH: { from: ['APPROVED'], to: 'DISPATCHED' },
      RECEIVE: { from: ['DISPATCHED'], to: 'RECEIVED' },
      CANCEL: { from: ['REQUESTED', 'APPROVED'], to: 'CANCELLED' },
    };
    const transition = transitions[action];
    if (!transition) return res.status(400).json({ error: 'Invalid transfer action.' });

    let transferId: Types.ObjectId | null = null;
    await session.withTransaction(async () => {
      const transfer = await StockTransfer.findOne({
        _id: transferIdParam,
        hq: context.hqId,
        status: { $in: transition.from },
      }).session(session);
      if (!transfer) throw Object.assign(new Error('Transfer is no longer available for this action.'), { status: 409 });

      if (action === 'DISPATCH') {
        const source = await Inventory.findOneAndUpdate(
          { _id: transfer.item, user: transfer.fromLocation, isDeleted: { $ne: true }, quantity: { $gte: transfer.quantity } },
          { $inc: { quantity: -transfer.quantity } },
          { new: true, session }
        );
        if (!source) throw Object.assign(new Error('Source stock is no longer sufficient.'), { status: 409 });
      }

      if (action === 'RECEIVE') {
        const source = await Inventory.findById(transfer.item).session(session);
        if (!source) throw Object.assign(new Error('The original product no longer exists.'), { status: 409 });
        const destination = await Inventory.findOne({
          user: transfer.toLocation,
          name: transfer.itemName,
          isDeleted: { $ne: true },
        }).session(session);
        if (destination) {
          destination.quantity += transfer.quantity;
          await destination.save({ session });
        } else {
          await Inventory.create([{
            user: transfer.toLocation,
            name: transfer.itemName,
            quantity: transfer.quantity,
            lastUnitPrice: source.lastUnitPrice,
            costPrice: source.costPrice,
            category: source.category,
            image: source.image,
            barcode: source.barcode,
            lowStockThreshold: source.lowStockThreshold,
            supplierName: source.supplierName,
            supplierPhone: source.supplierPhone,
            isPublished: false,
          }], { session });
        }
        await Transaction.create([{
          user: context.hqId,
          type: 'TRANSFER',
          totalMoney: 0,
          items: [{ name: transfer.itemName, itemId: transfer.item, qty: transfer.quantity, unit: '', unitPrice: source.lastUnitPrice, costPrice: source.costPrice, total: 0 }],
          date: new Date().toISOString().slice(0, 10),
          timestamp: new Date(),
          notes: `${transfer.reference}: ${transfer.itemName} from ${transfer.fromLocation} to ${transfer.toLocation}`,
        }], { session });
      }

      transfer.status = transition.to;
      const now = new Date();
      if (action === 'APPROVE') { transfer.approvedBy = context.actorId; transfer.approvedAt = now; }
      if (action === 'DISPATCH') { transfer.dispatchedBy = context.actorId; transfer.dispatchedAt = now; }
      if (action === 'RECEIVE') { transfer.receivedBy = context.actorId; transfer.receivedAt = now; }
      if (['CANCEL', 'REJECT'].includes(action)) { transfer.cancelledBy = context.actorId; transfer.cancelledAt = now; }
      transfer.events.push({ action: transition.to, actor: context.actorId, at: now, note });
      await transfer.save({ session });
      transferId = transfer._id as Types.ObjectId;
    });

    const result = await populateTransfer(StockTransfer.findById(transferId)).lean();
    return res.json({ transfer: result });
  } catch (error: any) {
    console.error('Update Stock Transfer Error:', error);
    const unsupportedTransaction = /Transaction numbers are only allowed|replica set|mongos/i.test(String(error?.message || ''));
    if (unsupportedTransaction) {
      return res.status(503).json({ error: 'Safe stock transfers require MongoDB replica-set transactions. No stock was changed.' });
    }
    return res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Could not update the transfer.' });
  } finally {
    await session.endSession();
  }
};

export const receiveSupplierStock = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    const context = await getContext(req);
    if (!context) return res.status(403).json({ error: 'Warehouse access denied.' });
    const locationId = String(req.body?.locationId || '');
    const itemId = String(req.body?.itemId || '');
    const quantity = Number(req.body?.quantity);
    const supplier = cleanText(req.body?.supplier, 120);
    const reference = cleanText(req.body?.reference, 120);
    if (!Types.ObjectId.isValid(locationId) || !Types.ObjectId.isValid(itemId) || !Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Choose a valid warehouse product and quantity.' });
    }
    const location = await User.findOne({ _id: locationId, ...locationScope(context.hqId) });
    if (!location) return res.status(404).json({ error: 'Warehouse location not found.' });
    const allLocations = await getLocations(context.hqId);
    const allLocationIds = allLocations.map((entry) => entry._id);
    const template = await Inventory.findOne({ _id: itemId, user: { $in: allLocationIds }, isDeleted: { $ne: true } });
    if (!template) return res.status(404).json({ error: 'Product was not found under this account.' });
    let item: any;
    await session.withTransaction(async () => {
      item = await Inventory.findOne({ user: location._id, name: template.name, isDeleted: { $ne: true } }).session(session);
      if (item) {
        item.quantity += quantity;
        if (supplier) item.supplierName = supplier;
        await item.save({ session });
      } else {
        [item] = await Inventory.create([{
          user: location._id, name: template.name, quantity,
          lastUnitPrice: template.lastUnitPrice, costPrice: template.costPrice,
          category: template.category, image: template.image, barcode: template.barcode,
          lowStockThreshold: template.lowStockThreshold,
          supplierName: supplier || template.supplierName, supplierPhone: template.supplierPhone,
          isPublished: false,
        }], { session });
      }
      await Transaction.create([{
        user: location._id, type: 'RESTOCK', totalMoney: Number(item.costPrice || 0) * quantity,
        items: [{ name: item.name, itemId: item._id, qty: quantity, unit: '', unitPrice: item.costPrice, costPrice: item.costPrice, total: Number(item.costPrice || 0) * quantity }],
        date: new Date().toISOString().slice(0, 10), timestamp: new Date(),
        notes: [supplier && `Supplier: ${supplier}`, reference && `Reference: ${reference}`].filter(Boolean).join(' | '),
      }], { session });
    });
    return res.json({ item, message: `${quantity} units received into ${location.businessName}.` });
  } catch (error: any) {
    console.error('Receive Supplier Stock Error:', error);
    if (/Transaction numbers are only allowed|replica set|mongos/i.test(String(error?.message || ''))) {
      return res.status(503).json({ error: 'Safe stock receiving requires MongoDB replica-set transactions. No stock was changed.' });
    }
    return res.status(500).json({ error: 'Could not receive supplier stock.' });
  } finally {
    await session.endSession();
  }
};
