import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../models/user.model';

const auditTrials = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('✅ Connected to MongoDB');

    const now = new Date();
    console.log(`Current Time: ${now.toISOString()}`);

    // 1. Total users on trial
    const totalTrial = await User.countDocuments({ subscriptionStatus: 'trial' });
    console.log(`Total users on 'trial': ${totalTrial}`);

    // 2. Users on trial with expired trialEndsAt
    const expiredTrial = await User.countDocuments({
      subscriptionStatus: 'trial',
      trialEndsAt: { $lt: now },
    });
    console.log(`Users on 'trial' with expired dates (should be fixed): ${expiredTrial}`);

    // 3. Users on trial with valid future trialEndsAt
    const validTrial = await User.countDocuments({
      subscriptionStatus: 'trial',
      trialEndsAt: { $gte: now },
    });
    console.log(`Users on 'trial' with valid future dates: ${validTrial}`);

    // 4. Users on trial with MISSING trialEndsAt
    const missingDateTrial = await User.countDocuments({
      subscriptionStatus: 'trial',
      trialEndsAt: { $exists: false },
    });
    const nullDateTrial = await User.countDocuments({
      subscriptionStatus: 'trial',
      trialEndsAt: null,
    });
    console.log(`Users on 'trial' with MISSING trialEndsAt: ${missingDateTrial}`);
    console.log(`Users on 'trial' with NULL trialEndsAt: ${nullDateTrial}`);

    // 5. Sample of 'expired' users that are still on trial (to verify dates)
    if (expiredTrial > 0) {
        const sample = await User.find({
            subscriptionStatus: 'trial',
            trialEndsAt: { $lt: now },
        }).limit(5).select('phoneNumber trialEndsAt subscriptionStatus');
        
        console.log('Sample of expired users still on trial:');
        sample.forEach(u => {
            console.log(`- ${u.phoneNumber}: Ends ${u.trialEndsAt}`);
        });
    }

  } catch (error) {
    console.error('❌ Error auditing trials:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

auditTrials();
