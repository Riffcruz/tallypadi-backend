import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AdminAuditLog } from '../models/adminAuditLog.model';
import { PROMO_AUDIENCES, PromoCode } from '../models/promoCode.model';
import { PromoRedemption } from '../models/promoRedemption.model';
import {
  PromoRedemptionError,
  isValidPromoCodeFormat,
  normalizePromoCode,
  redeemPromotionForUser,
} from '../services/promoCode.service';

const createPromoSchema = z.object({
  code: z.string().min(4).max(32),
  description: z.string().trim().max(240).optional().nullable(),
  planType: z.enum(['OGA_BOSS', 'TYCOON']),
  durationValue: z.coerce.number().int().min(1).max(3650),
  durationUnit: z.enum(['DAYS', 'MONTHS']),
  audience: z.enum(PROMO_AUDIENCES),
  recentRegistrationDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  expiresAt: z.coerce.date(),
});

const updatePromoSchema = z.object({
  isActive: z.boolean().optional(),
  expiresAt: z.coerce.date().optional(),
}).refine((value) => value.isActive !== undefined || value.expiresAt !== undefined, {
  message: 'No supported changes supplied.',
});

const serializePromo = (promo: any, redemptionCount = 0) => ({
  id: String(promo._id),
  code: promo.code,
  description: promo.description || '',
  planType: promo.planType,
  durationValue: promo.durationValue,
  durationUnit: promo.durationUnit,
  audience: promo.audience,
  recentRegistrationDays: promo.recentRegistrationDays || null,
  expiresAt: promo.expiresAt,
  isActive: Boolean(promo.isActive),
  redemptionCount,
  createdAt: promo.createdAt,
  updatedAt: promo.updatedAt,
});

export const createAdminPromoCode = async (req: Request, res: Response) => {
  try {
    const parsed = createPromoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid promotional code settings.' });

    const code = normalizePromoCode(parsed.data.code);
    if (!isValidPromoCodeFormat(code)) {
      return res.status(400).json({ error: 'Code must be 4-32 characters using only letters, numbers, hyphens, or underscores.' });
    }
    if (parsed.data.expiresAt <= new Date()) return res.status(400).json({ error: 'Code expiration must be in the future.' });
    if (parsed.data.durationUnit === 'MONTHS' && parsed.data.durationValue > 120) {
      return res.status(400).json({ error: 'Promotional duration cannot exceed 120 months.' });
    }

    const adminId = String(req.admin?._id || req.user?.id || '');
    if (!Types.ObjectId.isValid(adminId)) return res.status(403).json({ error: 'Admin identity could not be resolved.' });

    const promo = await PromoCode.create({
      ...parsed.data,
      code,
      description: parsed.data.description || null,
      recentRegistrationDays: parsed.data.audience === 'RECENTLY_REGISTERED'
        ? (parsed.data.recentRegistrationDays || 7)
        : null,
      createdBy: new Types.ObjectId(adminId),
      isActive: true,
    });

    await AdminAuditLog.create({
      admin: new Types.ObjectId(adminId),
      action: 'Create promotional code',
      afterValue: serializePromo(promo),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.status(201).json({ promoCode: serializePromo(promo) });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ error: 'That promotional code already exists.' });
    console.error('Create promo code error:', error);
    return res.status(500).json({ error: 'Could not create promotional code.' });
  }
};

export const listAdminPromoCodes = async (_req: Request, res: Response) => {
  try {
    const [promos, counts] = await Promise.all([
      PromoCode.find().sort({ createdAt: -1 }).lean(),
      PromoRedemption.aggregate([
        { $match: { status: 'APPLIED' } },
        { $group: { _id: '$promoCode', count: { $sum: 1 } } },
      ]),
    ]);
    const countMap = new Map(counts.map((entry) => [String(entry._id), Number(entry.count || 0)]));
    return res.json({ promoCodes: promos.map((promo) => serializePromo(promo, countMap.get(String(promo._id)) || 0)) });
  } catch (error) {
    console.error('List promo codes error:', error);
    return res.status(500).json({ error: 'Could not load promotional codes.' });
  }
};

export const updateAdminPromoCode = async (req: Request, res: Response) => {
  try {
    const promoId = String(req.params.id || '');
    if (!Types.ObjectId.isValid(promoId)) return res.status(400).json({ error: 'Invalid promotional code ID.' });
    const parsed = updatePromoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update.' });
    if (parsed.data.expiresAt && parsed.data.expiresAt <= new Date()) {
      return res.status(400).json({ error: 'Code expiration must be in the future.' });
    }

    const before = await PromoCode.findById(promoId).lean();
    if (!before) return res.status(404).json({ error: 'Promotional code not found.' });
    const promo = await PromoCode.findByIdAndUpdate(promoId, { $set: parsed.data }, { new: true });
    if (!promo) return res.status(404).json({ error: 'Promotional code not found.' });

    const adminId = String(req.admin?._id || req.user?.id || '');
    await AdminAuditLog.create({
      admin: Types.ObjectId.isValid(adminId) ? new Types.ObjectId(adminId) : null,
      action: 'Update promotional code',
      beforeValue: serializePromo(before),
      afterValue: serializePromo(promo),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.json({ promoCode: serializePromo(promo) });
  } catch (error) {
    console.error('Update promo code error:', error);
    return res.status(500).json({ error: 'Could not update promotional code.' });
  }
};

export const redeemPromoCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '');
    const result = await redeemPromotionForUser(String(req.user?.id || ''), code, 'WEB');
    return res.json({
      message: `Promotional code activated. Your ${result.planType.replace(/_/g, ' ')} plan is active.`,
      promotion: {
        code: result.code,
        planType: result.planType,
        nextBillingDate: result.nextBillingDate,
      },
    });
  } catch (error) {
    if (error instanceof PromoRedemptionError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error('Redeem promo code error:', error);
    return res.status(500).json({ error: 'Could not redeem promotional code.' });
  }
};
