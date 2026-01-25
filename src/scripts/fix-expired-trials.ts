import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../models/user.model';

const fixExpiredTrials = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('✅ Connected to MongoDB');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.log(`🕒 Time: ${now.toISOString()}`);

    // 1. Standard Expiration (trialEndsAt < now)
    const trialResult = await User.updateMany(
      {
        subscriptionStatus: 'trial',
        trialEndsAt: { $lt: now },
      },
      {
        $set: { subscriptionStatus: 'past_due' },
      }
    );
    console.log(`📉 Expired ${trialResult.modifiedCount} users via trialEndsAt check.`);

    // 2. Fallback: Missing trialEndsAt but created > 7 days ago
    const missingDateResult = await User.updateMany(
      {
        subscriptionStatus: 'trial',
        trialEndsAt: { $exists: false },
        createdAt: { $lt: sevenDaysAgo },
      },
      {
        $set: { subscriptionStatus: 'past_due' },
      }
    );
    console.log(`📉 Expired ${missingDateResult.modifiedCount} users with missing trialEndsAt (older than 7 days).`);

    // 3. Fallback: Null trialEndsAt but created > 7 days ago
    const nullDateResult = await User.updateMany(
      {
        subscriptionStatus: 'trial',
        trialEndsAt: null,
        createdAt: { $lt: sevenDaysAgo },
      },
      {
        $set: { subscriptionStatus: 'past_due' },
      }
    );
    console.log(`📉 Expired ${nullDateResult.modifiedCount} users with NULL trialEndsAt (older than 7 days).`);


    // Expire Active Plans
    const activeResult = await User.updateMany(
      {
        subscriptionStatus: 'active',
        nextBillingDate: { $lt: now },
      },
      {
        $set: { subscriptionStatus: 'past_due' },
      }
    );

    console.log(`📉 Expired ${activeResult.modifiedCount} active users.`);

  } catch (error) {
    console.error('❌ Error fixing expired trials:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

fixExpiredTrials();
