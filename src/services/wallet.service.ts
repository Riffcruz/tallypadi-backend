import { Types } from 'mongoose';
import { BillingEvent } from '../models/billingEvent.model';
import { User } from '../models/user.model';
import { activityService } from './activity.service';

interface CreditWalletInput {
  userId: string | Types.ObjectId;
  reference: string;
  paystackData: Record<string, unknown>;
}

const isDuplicateKeyError = (error: unknown) => {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
};

const getNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const walletService = {
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

    const amountInNaira = amountInKobo / 100;

    try {
      await BillingEvent.create({
        reference: providerReference,
        event: 'charge.success',
        user: new Types.ObjectId(userId),
        payload: {
          ...input.paystackData,
          walletCreditStatus: 'reserved',
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const currentUser = await User.findById(userId).select('walletBalance');
        return {
          credited: false,
          amountInNaira,
          reference: providerReference,
          walletBalance: currentUser?.walletBalance || 0,
        };
      }
      throw error;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: amountInNaira } },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('User not found while crediting wallet');
    }

    await BillingEvent.updateOne(
      { reference: providerReference, event: 'charge.success' },
      {
        $set: {
          user: updatedUser._id,
          payload: {
            ...input.paystackData,
            walletCreditStatus: 'credited',
            walletBalanceAfter: updatedUser.walletBalance || 0,
          },
        },
      }
    );

    await activityService.recordActivitySafely({
      user: updatedUser._id as any,
      actor: updatedUser._id as any,
      type: 'WALLET_FUNDING',
      title: 'Wallet funded successfully',
      message: `Your ads wallet was funded with ₦${amountInNaira.toLocaleString()}.`,
      amount: amountInNaira,
      metadata: {
        reference: providerReference,
        provider: 'paystack',
        walletBalance: updatedUser.walletBalance || 0,
      },
    });

    return {
      credited: true,
      amountInNaira,
      reference: providerReference,
      walletBalance: updatedUser.walletBalance || 0,
    };
  },
};
