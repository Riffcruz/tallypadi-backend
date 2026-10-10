import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { PromoAudience, PromoCode, PromoDurationUnit, PromoPlan } from '../models/promoCode.model';
import { PromoRedemption } from '../models/promoRedemption.model';
import { activityService } from './activity.service';

export class PromoRedemptionError extends Error {
  constructor(
    public readonly code: 'INVALID_CODE' | 'EXPIRED_CODE' | 'INELIGIBLE' | 'ALREADY_REDEEMED' | 'ACCOUNT_BLOCKED',
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}

export const normalizePromoCode = (value: unknown) => String(value || '')
  .trim()
  .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
  .toUpperCase();

export const isValidPromoCodeFormat = (value: unknown) => /^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(normalizePromoCode(value));

export const extractPromoCodeCandidate = (message: string): { code: string; explicit: boolean } | null => {
  const text = String(message || '').trim();
  const explicit = text.match(/^(?:promo(?:tional)?(?:\s+code)?|redeem|activate(?:\s+code)?|use\s+code)\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,31})[.!]?$/i);
  if (explicit) return { code: normalizePromoCode(explicit[1]), explicit: true };
  if (/^[a-z0-9][a-z0-9_-]{3,31}$/i.test(text)) return { code: normalizePromoCode(text), explicit: false };
  return null;
};

export const addPromoDuration = (base: Date, value: number, unit: PromoDurationUnit): Date => {
  const amount = Math.max(1, Math.trunc(value));
  if (unit === 'DAYS') return new Date(base.getTime() + amount * 24 * 60 * 60 * 1000);

  const result = new Date(base);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
};

const validFutureDate = (value: unknown, now: Date): Date | null => {
  if (!value) return null;
  const date = new Date(value as Date | string);
  return Number.isFinite(date.getTime()) && date > now ? date : null;
};

export const getPromoBaseDate = (user: Record<string, any>, now = new Date()): Date => {
  const subscriptionExpiry = validFutureDate(user.nextBillingDate, now);
  const trialExpiry = validFutureDate(user.trialEndsAt, now);
  const candidates = [now, subscriptionExpiry, trialExpiry].filter(Boolean) as Date[];
  return new Date(Math.max(...candidates.map((date) => date.getTime())));
};

export const buildPromoAudienceMongoFilter = (
  audience: PromoAudience,
  now = new Date(),
  recentRegistrationDays = 7
): Record<string, unknown> => {
  const common = {
    role: { $in: ['OWNER', 'HQ'] },
    registrationStage: 'COMPLETED',
    subscriptionStatus: { $ne: 'suspended' },
  };

  switch (audience) {
    case 'RECENTLY_REGISTERED':
      return { ...common, createdAt: { $gte: new Date(now.getTime() - recentRegistrationDays * 86_400_000) } };
    case 'TYCOON_USERS':
      return { ...common, planType: 'TYCOON' };
    case 'OGA_BOSS_USERS':
      return { ...common, planType: 'OGA_BOSS' };
    case 'ACTIVE_SUBSCRIBERS':
      return { ...common, subscriptionStatus: 'active', nextBillingDate: { $gt: now } };
    case 'ACTIVE_TRIALS':
      return { ...common, subscriptionStatus: 'trial', trialEndsAt: { $gt: now } };
    case 'PAST_DUE_USERS':
      return { ...common, subscriptionStatus: 'past_due' };
    case 'EXPIRED_TRIALS':
      return { ...common, trialEndsAt: { $lte: now }, subscriptionStatus: { $in: ['trial', 'past_due', 'cancelled'] } };
    case 'EXPIRED_SUBSCRIPTIONS':
      return { ...common, nextBillingDate: { $lte: now }, subscriptionStatus: { $in: ['active', 'past_due', 'cancelled'] } };
    case 'EXPIRED_USERS':
      return {
        ...common,
        $or: [
          { subscriptionStatus: { $in: ['past_due', 'cancelled'] } },
          { subscriptionStatus: 'trial', trialEndsAt: { $lte: now } },
          { subscriptionStatus: 'active', nextBillingDate: { $lte: now } },
        ],
      };
    case 'ALL_USERS':
    default:
      return common;
  }
};

export const userMatchesPromoAudience = (
  user: Record<string, any>,
  audience: PromoAudience,
  now = new Date(),
  recentRegistrationDays = 7
): boolean => {
  if (!['OWNER', 'HQ'].includes(String(user.role || '').toUpperCase())) return false;
  if (user.registrationStage !== 'COMPLETED' || user.subscriptionStatus === 'suspended') return false;

  const createdAt = user.createdAt ? new Date(user.createdAt) : null;
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const nextBillingDate = user.nextBillingDate ? new Date(user.nextBillingDate) : null;
  const status = String(user.subscriptionStatus || '');

  switch (audience) {
    case 'RECENTLY_REGISTERED': return Boolean(createdAt && createdAt >= new Date(now.getTime() - recentRegistrationDays * 86_400_000));
    case 'TYCOON_USERS': return user.planType === 'TYCOON';
    case 'OGA_BOSS_USERS': return user.planType === 'OGA_BOSS';
    case 'ACTIVE_SUBSCRIBERS': return status === 'active' && Boolean(nextBillingDate && nextBillingDate > now);
    case 'ACTIVE_TRIALS': return status === 'trial' && Boolean(trialEndsAt && trialEndsAt > now);
    case 'PAST_DUE_USERS': return status === 'past_due';
    case 'EXPIRED_TRIALS': return ['trial', 'past_due', 'cancelled'].includes(status) && Boolean(trialEndsAt && trialEndsAt <= now);
    case 'EXPIRED_SUBSCRIPTIONS': return ['active', 'past_due', 'cancelled'].includes(status) && Boolean(nextBillingDate && nextBillingDate <= now);
    case 'EXPIRED_USERS':
      return ['past_due', 'cancelled'].includes(status)
        || (status === 'trial' && Boolean(trialEndsAt && trialEndsAt <= now))
        || (status === 'active' && Boolean(nextBillingDate && nextBillingDate <= now));
    case 'ALL_USERS':
    default: return true;
  }
};

type RedemptionResult = {
  code: string;
  planType: PromoPlan;
  nextBillingDate: Date;
  durationValue: number;
  durationUnit: PromoDurationUnit;
};

export const promoCodeExists = async (rawCode: string): Promise<boolean> => {
  const code = normalizePromoCode(rawCode);
  if (!isValidPromoCodeFormat(code)) return false;
  return Boolean(await PromoCode.exists({ code }));
};

export const redeemPromotionForUser = async (
  userId: string | Types.ObjectId,
  rawCode: string,
  channel: 'WEB' | 'WHATSAPP'
): Promise<RedemptionResult> => {
  const code = normalizePromoCode(rawCode);
  if (!isValidPromoCodeFormat(code)) {
    throw new PromoRedemptionError('INVALID_CODE', 'This promotional code is invalid.');
  }

  const now = new Date();
  const promo = await PromoCode.findOne({ code }).lean();
  if (!promo || !promo.isActive) {
    throw new PromoRedemptionError('INVALID_CODE', 'This promotional code is invalid or inactive.');
  }
  if (new Date(promo.expiresAt) <= now) {
    throw new PromoRedemptionError('EXPIRED_CODE', 'This promotional code has expired.');
  }

  const user = await User.findById(userId).lean();
  if (!user) throw new PromoRedemptionError('INELIGIBLE', 'Account not found.', 404);
  if (user.subscriptionStatus === 'suspended') {
    throw new PromoRedemptionError('ACCOUNT_BLOCKED', 'Suspended accounts cannot redeem promotional codes.', 403);
  }

  const recentDays = promo.recentRegistrationDays || 7;
  if (!userMatchesPromoAudience(user as Record<string, any>, promo.audience, now, recentDays)) {
    throw new PromoRedemptionError('INELIGIBLE', 'This promotional code is not available for your account.');
  }

  const normalizedPhone = String(user.phoneNumber || '').replace(/\D/g, '');
  if (normalizedPhone.length < 8) {
    throw new PromoRedemptionError('INELIGIBLE', 'Your account phone number must be valid before using a promotional code.');
  }
  const existing = await PromoRedemption.findOne({
    promoCode: promo._id,
    $or: [
      { user: user._id },
      { phoneNumber: normalizedPhone },
    ],
  }).lean();
  if (existing?.status === 'APPLIED') {
    throw new PromoRedemptionError('ALREADY_REDEEMED', 'You have already used this promotional code.', 409);
  }

  let redemption = existing;
  if (!redemption) {
    try {
      redemption = await PromoRedemption.create({
        promoCode: promo._id,
        user: user._id,
        phoneNumber: normalizedPhone,
        code: promo.code,
        channel,
        status: 'PENDING',
        previousPlan: user.planType || null,
        previousSubscriptionStatus: user.subscriptionStatus || null,
        previousExpiry: user.nextBillingDate || user.trialEndsAt || null,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const duplicate = await PromoRedemption.findOne({
        promoCode: promo._id,
        $or: [{ user: user._id }, { phoneNumber: normalizedPhone }],
      }).lean();
      if (duplicate?.status === 'APPLIED') {
        throw new PromoRedemptionError('ALREADY_REDEEMED', 'You have already used this promotional code.', 409);
      }
      redemption = duplicate;
    }
  }

  if (!redemption) throw new Error('Could not reserve promotional code redemption.');

  const baseDate = getPromoBaseDate(user as Record<string, any>, now);
  const nextBillingDate = addPromoDuration(baseDate, promo.durationValue, promo.durationUnit);
  const audienceFilter = buildPromoAudienceMongoFilter(promo.audience, now, recentDays);

  const updated = await User.findOneAndUpdate(
    {
      $and: [
        { _id: user._id },
        { redeemedPromoCodes: { $ne: promo._id } },
        audienceFilter,
      ],
    },
    {
      $set: {
        planType: promo.planType,
        subscriptionStatus: 'active',
        nextBillingDate,
      },
      $addToSet: { redeemedPromoCodes: promo._id },
    },
    { new: true }
  ).lean();

  if (!updated) {
    const alreadyApplied = await User.exists({ _id: user._id, redeemedPromoCodes: promo._id });
    if (alreadyApplied) {
      await PromoRedemption.updateOne(
        { _id: redemption._id },
        { $set: { status: 'APPLIED', redeemedAt: now } }
      );
      throw new PromoRedemptionError('ALREADY_REDEEMED', 'You have already used this promotional code.', 409);
    }

    await PromoRedemption.deleteOne({ _id: redemption._id, status: 'PENDING' });
    throw new PromoRedemptionError('INELIGIBLE', 'This promotional code is not available for your account.');
  }

  await PromoRedemption.updateOne(
    { _id: redemption._id },
    {
      $set: {
        status: 'APPLIED',
        appliedPlan: promo.planType,
        appliedExpiry: nextBillingDate,
        redeemedAt: now,
        channel,
      },
    }
  );

  // Keep linked staff display/access fields aligned with the owner account.
  await User.updateMany(
    { ownerId: user._id, role: 'STAFF' },
    { $set: { planType: promo.planType, subscriptionStatus: 'active', nextBillingDate } }
  );

  await activityService.recordActivitySafely({
    user: user._id,
    actor: user._id,
    type: 'SUBSCRIPTION',
    title: 'Promotional code activated',
    message: `${promo.planType.replace(/_/g, ' ')} is active until ${nextBillingDate.toLocaleDateString('en-NG')}.`,
    metadata: {
      promoCodeId: String(promo._id),
      code: promo.code,
      channel,
      planType: promo.planType,
      nextBillingDate: nextBillingDate.toISOString(),
    },
  });

  return {
    code: promo.code,
    planType: promo.planType,
    nextBillingDate,
    durationValue: promo.durationValue,
    durationUnit: promo.durationUnit,
  };
};
