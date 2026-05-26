import crypto from 'crypto';
import mongoose, { ClientSession, Types } from 'mongoose';

import { AdminSettings } from '../models/adminSettings.model';
import { ReferralTransaction } from '../models/referralTransaction.model';
import { User } from '../models/user.model';
import { Wallet, IWallet } from '../models/wallet.model';
import { WalletTransaction } from '../models/walletTransaction.model';
import { toMajorUnits, toMinorUnits } from './adBudget.service';

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,24}$/;

const isDuplicateKeyError = (error: unknown) => {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
};

const objectId = (value: string | Types.ObjectId) => (
  value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value))
);

const idsEqual = (a: unknown, b: unknown) => String(a || '') === String(b || '');

export const normalizeReferralCode = (raw: unknown) => {
  const code = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);

  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
};

const makeReferralCode = () => {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
  return code;
};

export const canApplyReferral = (input: {
  referrerId?: unknown;
  referredUserId?: unknown;
  referrerRole?: unknown;
  referrerStatus?: unknown;
  existingReferredBy?: unknown;
}) => {
  if (!input.referrerId || !input.referredUserId) {
    return { ok: false, reason: 'MISSING_USER' };
  }
  if (idsEqual(input.referrerId, input.referredUserId)) {
    return { ok: false, reason: 'SELF_REFERRAL' };
  }
  if (String(input.referrerRole || '').toUpperCase() !== 'OWNER') {
    return { ok: false, reason: 'REFERRER_NOT_OWNER' };
  }
  if (String(input.referrerStatus || '').toLowerCase() === 'suspended') {
    return { ok: false, reason: 'REFERRER_SUSPENDED' };
  }
  if (input.existingReferredBy) {
    return { ok: false, reason: 'ALREADY_REFERRED' };
  }

  return { ok: true, reason: 'OK' };
};

export const calculateReferralRewardMinor = (input: {
  enabled: boolean;
  fundingAmountMinor: number;
  minimumFundingAmountMinor: number;
  rewardPercentage: number;
  alreadyRewarded?: boolean;
}) => {
  const fundingAmountMinor = Math.max(0, Math.floor(Number(input.fundingAmountMinor) || 0));
  const minimumFundingAmountMinor = Math.max(0, Math.floor(Number(input.minimumFundingAmountMinor) || 0));
  const rewardPercentage = Math.max(0, Math.min(100, Number(input.rewardPercentage) || 0));

  if (input.alreadyRewarded) return { eligible: false, reason: 'ALREADY_REWARDED', rewardAmountMinor: 0 };
  if (!input.enabled) return { eligible: false, reason: 'DISABLED', rewardAmountMinor: 0 };
  if (fundingAmountMinor < minimumFundingAmountMinor) return { eligible: false, reason: 'BELOW_MINIMUM', rewardAmountMinor: 0 };

  const rewardAmountMinor = Math.floor((fundingAmountMinor * rewardPercentage) / 100);
  if (rewardAmountMinor <= 0) return { eligible: false, reason: 'ZERO_REWARD', rewardAmountMinor: 0 };

  return { eligible: true, reason: 'QUALIFIED', rewardAmountMinor };
};

const getReferralSettings = async (session?: ClientSession) => {
  let settings = await AdminSettings.findOne().session(session || null);
  if (!settings) {
    try {
      [settings] = await AdminSettings.create([{}], { session });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      settings = await AdminSettings.findOne().session(session || null);
    }
  }

  const referralProgram = settings?.referralProgram || {
    enabled: true,
    minimumFundingAmount: 10000,
    rewardPercentage: 10,
  };
  const minimumFundingAmount = Number(referralProgram.minimumFundingAmount ?? 10000);
  const rewardPercentage = Number(referralProgram.rewardPercentage ?? 10);

  return {
    enabled: referralProgram.enabled !== false,
    minimumFundingAmountMinor: toMinorUnits(Number.isFinite(minimumFundingAmount) ? minimumFundingAmount : 10000),
    rewardPercentage: Number.isFinite(rewardPercentage) ? Math.max(0, Math.min(100, rewardPercentage)) : 10,
  };
};

const syncUserWalletMirror = async (userId: string | Types.ObjectId, availableBalanceMinor: number, session?: ClientSession) => {
  await User.updateOne(
    { _id: userId },
    { $set: { walletBalance: toMajorUnits(availableBalanceMinor) } },
    { session }
  );
};

const getOrCreateReferralWallet = async (userId: string | Types.ObjectId, currency: string, session?: ClientSession): Promise<IWallet> => {
  const resolvedCurrency = String(currency || 'NGN').toUpperCase();
  let wallet = await Wallet.findOne({ user: userId, currency: resolvedCurrency }).session(session || null);
  if (wallet) return wallet;

  const user = await User.findById(userId).select('walletBalance').session(session || null);
  const legacyBalanceMajor = Number(user?.walletBalance || 0);
  const initialBalanceMinor = legacyBalanceMajor > 0 ? toMinorUnits(legacyBalanceMajor) : 0;

  try {
    [wallet] = await Wallet.create([{
      user: userId,
      currency: resolvedCurrency,
      availableBalanceMinor: initialBalanceMinor,
      reservedBalanceMinor: 0,
    }], { session });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    wallet = await Wallet.findOne({ user: userId, currency: resolvedCurrency }).session(session || null);
  }

  if (!wallet) throw new Error('Unable to create referral reward wallet');
  return wallet;
};

export const referralService = {
  async ensureReferralCode(userId: string | Types.ObjectId, session?: ClientSession) {
    const existing = await User.findById(userId).select('referralCode').session(session || null);
    if (existing?.referralCode) return existing.referralCode;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const referralCode = makeReferralCode();
      try {
        const updated = await User.findOneAndUpdate(
          {
            _id: userId,
            $or: [
              { referralCode: { $exists: false } },
              { referralCode: null },
              { referralCode: '' },
            ],
          },
          {
            $set: {
              referralCode,
              referralCodeCreatedAt: new Date(),
            },
          },
          { new: true, session }
        ).select('referralCode');

        if (updated?.referralCode) return updated.referralCode;

        const current = await User.findById(userId).select('referralCode').session(session || null);
        if (current?.referralCode) return current.referralCode;
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    }

    throw new Error('Unable to generate referral code');
  },

  async attachReferralToUser(input: {
    referredUserId: string | Types.ObjectId;
    referralCode?: unknown;
    session?: ClientSession;
  }) {
    const referralCode = normalizeReferralCode(input.referralCode);
    if (!referralCode) return { applied: false, reason: 'INVALID_CODE' };

    await this.ensureReferralCode(input.referredUserId, input.session);

    const [referredUser, referrer] = await Promise.all([
      User.findById(input.referredUserId)
        .select('referredBy referralCode registrationStage')
        .session(input.session || null),
      User.findOne({ referralCode, role: 'OWNER', subscriptionStatus: { $ne: 'suspended' } })
        .select('_id role subscriptionStatus referralCode')
        .session(input.session || null),
    ]);

    if (!referredUser || !referrer) return { applied: false, reason: 'REFERRER_NOT_FOUND' };

    const eligibility = canApplyReferral({
      referrerId: referrer._id,
      referredUserId: referredUser._id,
      referrerRole: referrer.role,
      referrerStatus: referrer.subscriptionStatus,
      existingReferredBy: referredUser.referredBy,
    });

    if (!eligibility.ok) return { applied: false, reason: eligibility.reason };

    const now = new Date();
    const update = await User.updateOne(
      {
        _id: referredUser._id,
        $or: [
          { referredBy: { $exists: false } },
          { referredBy: null },
        ],
      },
      {
        $set: {
          referredBy: referrer._id,
          referralRegisteredAt: now,
        },
      },
      { session: input.session }
    );

    if (!update.modifiedCount) return { applied: false, reason: 'ALREADY_REFERRED' };

    const isVerified = referredUser.registrationStage === 'COMPLETED';
    await ReferralTransaction.findOneAndUpdate(
      { referredUser: referredUser._id },
      {
        $setOnInsert: {
          referrer: referrer._id,
          referredUser: referredUser._id,
          referralCode,
          registeredAt: now,
          status: isVerified ? 'PENDING_FUNDING' : 'PENDING_VERIFICATION',
          verifiedAt: isVerified ? now : null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, session: input.session }
    );

    return { applied: true, reason: 'OK', referrerId: String(referrer._id), referralCode };
  },

  async markReferralVerified(referredUserId: string | Types.ObjectId, session?: ClientSession) {
    const user = await User.findById(referredUserId)
      .select('referredBy referralVerifiedAt')
      .session(session || null);

    if (!user?.referredBy) return null;

    const now = new Date();
    await User.updateOne(
      { _id: user._id },
      { $set: { referralVerifiedAt: now } },
      { session }
    );

    const transaction = await ReferralTransaction.findOneAndUpdate(
      {
        referredUser: user._id,
        status: { $ne: 'REWARDED' },
      },
      {
        $set: {
          status: 'PENDING_FUNDING',
          verifiedAt: now,
        },
      },
      { new: true, session }
    );

    return transaction;
  },

  async processWalletFundingReward(input: {
    referredUserId: string | Types.ObjectId;
    fundingAmountMinor: number;
    fundingWalletTransactionId?: string | Types.ObjectId | null;
    paystackReference: string;
    currency?: string;
    session?: ClientSession;
  }) {
    if (!input.session) {
      const session = await mongoose.startSession();
      let result: any = null;
      try {
        await session.withTransaction(async () => {
          result = await this.processWalletFundingReward({ ...input, session });
        });
        return result;
      } finally {
        await session.endSession();
      }
    }

    const referredUserId = objectId(input.referredUserId);
    const rewardIdempotencyKey = `referral-reward:${input.paystackReference}`;

    const existingReward = await WalletTransaction.findOne({ idempotencyKey: rewardIdempotencyKey })
      .session(input.session || null);
    if (existingReward) return { rewarded: false, reason: 'DUPLICATE_REWARD', rewardTransaction: existingReward };

    const referral = await ReferralTransaction.findOne({
      referredUser: referredUserId,
      status: { $ne: 'REWARDED' },
    }).session(input.session || null);

    if (!referral) return { rewarded: false, reason: 'NO_REFERRAL' };
    if (referral.status === 'PENDING_VERIFICATION') {
      await this.markReferralVerified(referredUserId, input.session);
      referral.status = 'PENDING_FUNDING';
    }

    const settings = await getReferralSettings(input.session);
    const decision = calculateReferralRewardMinor({
      enabled: settings.enabled,
      fundingAmountMinor: input.fundingAmountMinor,
      minimumFundingAmountMinor: settings.minimumFundingAmountMinor,
      rewardPercentage: settings.rewardPercentage,
      alreadyRewarded: referral.status === 'REWARDED',
    });

    const configSnapshot = {
      enabled: settings.enabled,
      minimumFundingAmountMinor: settings.minimumFundingAmountMinor,
      rewardPercentage: settings.rewardPercentage,
    };

    if (!decision.eligible) {
      await ReferralTransaction.updateOne(
        { _id: referral._id },
        {
          $set: {
            configSnapshot,
            metadata: {
              lastFundingAttemptAt: new Date().toISOString(),
              lastFundingAmountMinor: input.fundingAmountMinor,
              lastFundingReason: decision.reason,
              paystackReference: input.paystackReference,
            },
          },
        },
        { session: input.session }
      );

      return { rewarded: false, reason: decision.reason, referral };
    }

    const claimedReferral = await ReferralTransaction.findOneAndUpdate(
      {
        _id: referral._id,
        status: { $ne: 'REWARDED' },
        $or: [
          { idempotencyKey: { $exists: false } },
          { idempotencyKey: null },
          { idempotencyKey: '' },
        ],
      },
      { $set: { idempotencyKey: rewardIdempotencyKey } },
      { new: true, session: input.session }
    );

    if (!claimedReferral) {
      return { rewarded: false, reason: 'ALREADY_REWARDED', referral };
    }

    const currency = String(input.currency || 'NGN').toUpperCase();
    const wallet = await getOrCreateReferralWallet(claimedReferral.referrer, currency, input.session);
    const beforeAvailable = wallet.availableBalanceMinor;
    const beforeReserved = wallet.reservedBalanceMinor;

    wallet.availableBalanceMinor += decision.rewardAmountMinor;
    wallet.version += 1;
    await wallet.save({ session: input.session });

    const [rewardTransaction] = await WalletTransaction.create([{
      user: referral.referrer,
      wallet: wallet._id,
      type: 'REFERRAL_REWARD',
      amountMinor: decision.rewardAmountMinor,
      currency: wallet.currency,
      balanceBeforeAvailableMinor: beforeAvailable,
      balanceAfterAvailableMinor: wallet.availableBalanceMinor,
      balanceBeforeReservedMinor: beforeReserved,
      balanceAfterReservedMinor: wallet.reservedBalanceMinor,
      idempotencyKey: rewardIdempotencyKey,
      status: 'COMPLETED',
      metadata: {
        referredUserId: String(referredUserId),
        referralTransactionId: String(claimedReferral._id),
        fundingWalletTransactionId: input.fundingWalletTransactionId ? String(input.fundingWalletTransactionId) : null,
        paystackReference: input.paystackReference,
        fundingAmountMinor: input.fundingAmountMinor,
        rewardPercentage: settings.rewardPercentage,
        minimumFundingAmountMinor: settings.minimumFundingAmountMinor,
      },
    }], { session: input.session }) as any[];

    await ReferralTransaction.updateOne(
      { _id: claimedReferral._id, idempotencyKey: rewardIdempotencyKey },
      {
        $set: {
          status: 'REWARDED',
          qualifiedAt: new Date(),
          rewardedAt: new Date(),
          fundingWalletTransaction: input.fundingWalletTransactionId || null,
          rewardWalletTransaction: rewardTransaction._id,
          paystackReference: input.paystackReference,
          fundingAmountMinor: input.fundingAmountMinor,
          rewardAmountMinor: decision.rewardAmountMinor,
          currency: wallet.currency,
          configSnapshot,
        },
      },
      { session: input.session }
    );

    await syncUserWalletMirror(claimedReferral.referrer, wallet.availableBalanceMinor, input.session);

    return {
      rewarded: true,
      reason: decision.reason,
      referral: claimedReferral,
      rewardTransaction,
      rewardAmountMinor: decision.rewardAmountMinor,
      referrerId: String(claimedReferral.referrer),
      referredUserId: String(referredUserId),
      walletBalanceMinor: wallet.availableBalanceMinor,
    };
  },
};
