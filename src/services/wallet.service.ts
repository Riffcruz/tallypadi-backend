import mongoose, { ClientSession, Types } from 'mongoose';
import { BillingEvent } from '../models/billingEvent.model';
import { User } from '../models/user.model';
import { Wallet, IWallet } from '../models/wallet.model';
import { WalletTransaction, WalletTransactionType } from '../models/walletTransaction.model';
import { activityService } from './activity.service';
import { toMajorUnits, toMinorUnits } from './adBudget.service';

interface CreditWalletInput {
  userId: string | Types.ObjectId;
  reference: string;
  paystackData: Record<string, unknown>;
}

interface AdminTopUpWalletInput {
  userId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
}

interface LedgerInput {
  userId: string | Types.ObjectId;
  wallet: IWallet;
  type: WalletTransactionType;
  amountMinor: number;
  idempotencyKey: string;
  session?: ClientSession;
  campaignId?: string | Types.ObjectId | null;
  campaignRunId?: string | Types.ObjectId | null;
  providerCampaignId?: string | Types.ObjectId | null;
  beforeAvailable: number;
  afterAvailable: number;
  beforeReserved: number;
  afterReserved: number;
  metadata?: Record<string, unknown> | null;
}

const isDuplicateKeyError = (error: unknown) => {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
};

const getNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asObjectId = (value: string | Types.ObjectId | null | undefined) => {
  if (!value) return null;
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
};

const getUserWalletCurrency = async (userId: string | Types.ObjectId, session?: ClientSession) => {
  const user = await User.findById(userId)
    .select('settings.currencyCode countryCode walletBalance')
    .session(session || null);

  return {
    user,
    currency: String(user?.settings?.currencyCode || 'NGN').toUpperCase(),
  };
};

const syncUserWalletMirror = async (userId: string | Types.ObjectId, availableBalanceMinor: number, session?: ClientSession) => {
  await User.updateOne(
    { _id: userId },
    { $set: { walletBalance: toMajorUnits(availableBalanceMinor) } },
    { session }
  );
};

const createLedgerEntry = async (input: LedgerInput) => {
  const [existing] = await WalletTransaction.find({ idempotencyKey: input.idempotencyKey })
    .session(input.session || null)
    .limit(1);
  if (existing) return existing;

  const entries = await WalletTransaction.create([{
    user: asObjectId(input.userId) as any,
    wallet: input.wallet._id,
    campaign: asObjectId(input.campaignId) as any,
    campaignRun: asObjectId(input.campaignRunId) as any,
    providerCampaign: asObjectId(input.providerCampaignId) as any,
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.wallet.currency,
    balanceBeforeAvailableMinor: input.beforeAvailable,
    balanceAfterAvailableMinor: input.afterAvailable,
    balanceBeforeReservedMinor: input.beforeReserved,
    balanceAfterReservedMinor: input.afterReserved,
    idempotencyKey: input.idempotencyKey,
    status: 'COMPLETED',
    metadata: input.metadata || null,
  }], { session: input.session }) as any[];
  const entry = entries[0];

  return entry;
};

export const walletService = {
  async getOrCreateWallet(userId: string | Types.ObjectId, currency?: string, session?: ClientSession) {
    const resolvedCurrency = String(currency || (await getUserWalletCurrency(userId, session)).currency || 'NGN').toUpperCase();
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

    if (!wallet) throw new Error('Unable to create wallet');
    return wallet;
  },

  async getWalletSummary(userId: string | Types.ObjectId, session?: ClientSession) {
    const wallet = await this.getOrCreateWallet(userId, undefined, session);
    return {
      wallet,
      walletBalanceMinor: wallet.availableBalanceMinor,
      reservedBalanceMinor: wallet.reservedBalanceMinor,
      walletBalance: toMajorUnits(wallet.availableBalanceMinor),
      reservedBalance: toMajorUnits(wallet.reservedBalanceMinor),
      currency: wallet.currency,
    };
  },

  async creditWalletFromPaystack(input: CreditWalletInput) {
    const userId = String(input.userId);
    const providerReference = String(input.paystackData.reference || input.reference || '').trim();
    const amountInKobo = getNumber(input.paystackData.amount);

    if (!providerReference) {
      throw new Error('Paystack reference missing');
    }
    if (!amountInKobo || amountInKobo <= 0 || !Number.isInteger(amountInKobo)) {
      throw new Error('Invalid Paystack amount');
    }

    const session = await mongoose.startSession();
    let walletBalanceMinor = 0;

    try {
      await session.withTransaction(async () => {
        await BillingEvent.create([{
          reference: providerReference,
          event: 'charge.success',
          user: new Types.ObjectId(userId),
          payload: {
            ...input.paystackData,
            walletCreditStatus: 'reserved',
          },
        }], { session });

        const wallet = await this.getOrCreateWallet(userId, 'NGN', session);
        const beforeAvailable = wallet.availableBalanceMinor;
        const beforeReserved = wallet.reservedBalanceMinor;

        wallet.availableBalanceMinor += amountInKobo;
        wallet.version += 1;
        await wallet.save({ session });

        await createLedgerEntry({
          userId,
          wallet,
          type: 'ADS_WALLET_TOP_UP',
          amountMinor: amountInKobo,
          idempotencyKey: `wallet-topup:${providerReference}`,
          session,
          beforeAvailable,
          afterAvailable: wallet.availableBalanceMinor,
          beforeReserved,
          afterReserved: wallet.reservedBalanceMinor,
          metadata: {
            provider: 'paystack',
            reference: providerReference,
          },
        });

        walletBalanceMinor = wallet.availableBalanceMinor;
        await syncUserWalletMirror(userId, walletBalanceMinor, session);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const summary = await this.getWalletSummary(userId);
        return {
          credited: false,
          amountInNaira: toMajorUnits(amountInKobo),
          amountMinor: amountInKobo,
          reference: providerReference,
          walletBalance: summary.walletBalance,
          walletBalanceMinor: summary.walletBalanceMinor,
        };
      }
      throw error;
    } finally {
      await session.endSession();
    }

    await BillingEvent.updateOne(
      { reference: providerReference, event: 'charge.success' },
      {
        $set: {
          user: new Types.ObjectId(userId),
          payload: {
            ...input.paystackData,
            walletCreditStatus: 'credited',
            walletBalanceAfterMinor: walletBalanceMinor,
          },
        },
      }
    );

    await activityService.recordActivitySafely({
      user: new Types.ObjectId(userId),
      actor: new Types.ObjectId(userId),
      type: 'WALLET_FUNDING',
      title: 'Wallet funded successfully',
      message: `Your ads wallet was funded with ₦${toMajorUnits(amountInKobo).toLocaleString()}.`,
      amount: toMajorUnits(amountInKobo),
      metadata: {
        reference: providerReference,
        provider: 'paystack',
        walletBalanceMinor,
      },
    });

    return {
      credited: true,
      amountInNaira: toMajorUnits(amountInKobo),
      amountMinor: amountInKobo,
      reference: providerReference,
      walletBalance: toMajorUnits(walletBalanceMinor),
      walletBalanceMinor,
    };
  },

  async adminTopUpWallet(input: AdminTopUpWalletInput) {
    const userId = String(input.userId);
    const amountMinor = Number(input.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('Invalid wallet top-up amount');
    }

    const session = await mongoose.startSession();
    let walletBalanceMinor = 0;
    let transaction: any = null;

    try {
      await session.withTransaction(async () => {
        const existing = await WalletTransaction.findOne({ idempotencyKey: input.idempotencyKey }).session(session);
        if (existing) {
          const wallet = await Wallet.findById(existing.wallet).session(session);
          if (!wallet) throw new Error('Wallet not found for existing top-up');
          walletBalanceMinor = wallet.availableBalanceMinor;
          transaction = existing;
          return;
        }

        const wallet = await this.getOrCreateWallet(userId, undefined, session);
        const beforeAvailable = wallet.availableBalanceMinor;
        const beforeReserved = wallet.reservedBalanceMinor;

        wallet.availableBalanceMinor += amountMinor;
        wallet.version += 1;
        await wallet.save({ session });

        transaction = await createLedgerEntry({
          userId,
          wallet,
          type: 'ADMIN_ADJUSTMENT',
          amountMinor,
          idempotencyKey: input.idempotencyKey,
          session,
          beforeAvailable,
          afterAvailable: wallet.availableBalanceMinor,
          beforeReserved,
          afterReserved: wallet.reservedBalanceMinor,
          metadata: {
            direction: 'CREDIT',
            adminId: String(input.adminId),
            reason: input.reason,
          },
        });

        walletBalanceMinor = wallet.availableBalanceMinor;
        await syncUserWalletMirror(userId, walletBalanceMinor, session);
      });
    } finally {
      await session.endSession();
    }

    return {
      transaction,
      walletBalanceMinor,
      walletBalance: toMajorUnits(walletBalanceMinor),
      amountMinor,
      amount: toMajorUnits(amountMinor),
    };
  },

  async reserveCampaignBudget(input: {
    userId: string | Types.ObjectId;
    amountMinor: number;
    campaignId: string | Types.ObjectId;
    campaignRunId: string | Types.ObjectId;
    idempotencyKey: string;
    session: ClientSession;
  }) {
    const existing = await WalletTransaction.findOne({ idempotencyKey: input.idempotencyKey }).session(input.session);
    if (existing) {
      const wallet = await Wallet.findById(existing.wallet).session(input.session);
      if (!wallet) throw new Error('Wallet not found for existing reservation');
      return { wallet, transaction: existing };
    }

    const wallet = await this.getOrCreateWallet(input.userId, 'NGN', input.session);
    if (wallet.availableBalanceMinor < input.amountMinor) {
      throw new Error('Insufficient wallet balance');
    }

    const beforeAvailable = wallet.availableBalanceMinor;
    const beforeReserved = wallet.reservedBalanceMinor;
    wallet.availableBalanceMinor -= input.amountMinor;
    wallet.reservedBalanceMinor += input.amountMinor;
    wallet.version += 1;
    await wallet.save({ session: input.session });

    const transaction = await createLedgerEntry({
      userId: input.userId,
      wallet,
      type: 'CAMPAIGN_BUDGET_RESERVED',
      amountMinor: input.amountMinor,
      idempotencyKey: input.idempotencyKey,
      session: input.session,
      campaignId: input.campaignId,
      campaignRunId: input.campaignRunId,
      beforeAvailable,
      afterAvailable: wallet.availableBalanceMinor,
      beforeReserved,
      afterReserved: wallet.reservedBalanceMinor,
    });

    await syncUserWalletMirror(input.userId, wallet.availableBalanceMinor, input.session);
    return { wallet, transaction };
  },

  async releaseReserved(input: {
    userId: string | Types.ObjectId;
    amountMinor: number;
    campaignId?: string | Types.ObjectId | null;
    campaignRunId?: string | Types.ObjectId | null;
    providerCampaignId?: string | Types.ObjectId | null;
    type: Extract<WalletTransactionType, 'CAMPAIGN_BUDGET_RELEASED' | 'PROVIDER_ALLOCATION_REFUNDED' | 'UNUSED_BUDGET_REFUNDED'>;
    idempotencyKey: string;
    session: ClientSession;
    metadata?: Record<string, unknown> | null;
  }) {
    const existing = await WalletTransaction.findOne({ idempotencyKey: input.idempotencyKey }).session(input.session);
    if (existing) return existing;

    const wallet = await this.getOrCreateWallet(input.userId, 'NGN', input.session);
    if (wallet.reservedBalanceMinor < input.amountMinor) {
      throw new Error('Reserved wallet balance is too low for refund');
    }

    const beforeAvailable = wallet.availableBalanceMinor;
    const beforeReserved = wallet.reservedBalanceMinor;
    wallet.availableBalanceMinor += input.amountMinor;
    wallet.reservedBalanceMinor -= input.amountMinor;
    wallet.version += 1;
    await wallet.save({ session: input.session });

    const transaction = await createLedgerEntry({
      userId: input.userId,
      wallet,
      type: input.type,
      amountMinor: input.amountMinor,
      idempotencyKey: input.idempotencyKey,
      session: input.session,
      campaignId: input.campaignId,
      campaignRunId: input.campaignRunId,
      providerCampaignId: input.providerCampaignId,
      beforeAvailable,
      afterAvailable: wallet.availableBalanceMinor,
      beforeReserved,
      afterReserved: wallet.reservedBalanceMinor,
      metadata: input.metadata,
    });

    await syncUserWalletMirror(input.userId, wallet.availableBalanceMinor, input.session);
    return transaction;
  },

  async captureReserved(input: {
    userId: string | Types.ObjectId;
    amountMinor: number;
    campaignId?: string | Types.ObjectId | null;
    campaignRunId?: string | Types.ObjectId | null;
    type: Extract<WalletTransactionType, 'SERVICE_FEE_CAPTURED' | 'AD_SPEND_ALLOCATED'>;
    idempotencyKey: string;
    session: ClientSession;
    metadata?: Record<string, unknown> | null;
  }) {
    const existing = await WalletTransaction.findOne({ idempotencyKey: input.idempotencyKey }).session(input.session);
    if (existing) return existing;

    const wallet = await this.getOrCreateWallet(input.userId, 'NGN', input.session);
    if (wallet.reservedBalanceMinor < input.amountMinor) {
      throw new Error('Reserved wallet balance is too low for capture');
    }

    const beforeAvailable = wallet.availableBalanceMinor;
    const beforeReserved = wallet.reservedBalanceMinor;
    wallet.reservedBalanceMinor -= input.amountMinor;
    wallet.version += 1;
    await wallet.save({ session: input.session });

    return createLedgerEntry({
      userId: input.userId,
      wallet,
      type: input.type,
      amountMinor: input.amountMinor,
      idempotencyKey: input.idempotencyKey,
      session: input.session,
      campaignId: input.campaignId,
      campaignRunId: input.campaignRunId,
      beforeAvailable,
      afterAvailable: wallet.availableBalanceMinor,
      beforeReserved,
      afterReserved: wallet.reservedBalanceMinor,
      metadata: input.metadata,
    });
  },

  async recordNoBalanceLedger(input: {
    userId: string | Types.ObjectId;
    amountMinor: number;
    campaignId?: string | Types.ObjectId | null;
    campaignRunId?: string | Types.ObjectId | null;
    providerCampaignId?: string | Types.ObjectId | null;
    type: Extract<WalletTransactionType, 'AD_SPEND_ALLOCATED' | 'SAFETY_RESERVE_HELD' | 'FX_BUFFER_HELD' | 'CAMPAIGN_TOP_UP' | 'ADMIN_ADJUSTMENT'>;
    idempotencyKey: string;
    session: ClientSession;
    metadata?: Record<string, unknown> | null;
  }) {
    const existing = await WalletTransaction.findOne({ idempotencyKey: input.idempotencyKey }).session(input.session);
    if (existing) return existing;

    const wallet = await this.getOrCreateWallet(input.userId, 'NGN', input.session);
    return createLedgerEntry({
      userId: input.userId,
      wallet,
      type: input.type,
      amountMinor: input.amountMinor,
      idempotencyKey: input.idempotencyKey,
      session: input.session,
      campaignId: input.campaignId,
      campaignRunId: input.campaignRunId,
      providerCampaignId: input.providerCampaignId,
      beforeAvailable: wallet.availableBalanceMinor,
      afterAvailable: wallet.availableBalanceMinor,
      beforeReserved: wallet.reservedBalanceMinor,
      afterReserved: wallet.reservedBalanceMinor,
      metadata: input.metadata,
    });
  },
};
