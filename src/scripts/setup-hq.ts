import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/user.model';
import { env } from '../config/env';

dotenv.config();

const setupHQ = async () => {
  // --- CONFIGURATION ---
  // Replace these with the actual phone numbers you want to use
  const HQ_PHONE = process.argv[2];      // 1st arg: Phone number to become HQ
  const BRANCH_PHONE = process.argv[3];  // 2nd arg: Phone number of the Shop to link

  if (!HQ_PHONE || !BRANCH_PHONE) {
    console.error('❌ Usage: ts-node src/scripts/setup-hq.ts <HQ_PHONE> <BRANCH_PHONE>');
    process.exit(1);
  }

  try {
    await mongoose.connect(env.mongoUri);
    console.log('✅ DB Connected');

    // 1. Find or Create HQ User
    let hqUser = await User.findOne({ phoneNumber: HQ_PHONE });
    
    if (!hqUser) {
      console.log(`Creating new HQ user for ${HQ_PHONE}...`);
      hqUser = await User.create({
        phoneNumber: HQ_PHONE,
        role: 'HQ', // <--- KEY CHANGE
        businessName: 'My Enterprise HQ',
        name: 'The Big Boss',
        subscriptionStatus: 'active',
        planType: 'TYCOON'
      });
    } else {
      console.log(`Promoting ${HQ_PHONE} to HQ role...`);
      hqUser.role = 'HQ';
      // Ensure subscription allows access
      hqUser.subscriptionStatus = 'active'; 
      await hqUser.save();
    }
    console.log(`✅ HQ Account Ready: ${hqUser.businessName} (${hqUser._id})`);

    // 2. Find Branch Owner
    const branchUser = await User.findOne({ phoneNumber: BRANCH_PHONE });
    if (!branchUser) {
      console.error(`❌ Branch user not found: ${BRANCH_PHONE}`);
      process.exit(1);
    }

    if (branchUser.role !== 'OWNER') {
        console.error(`❌ User ${BRANCH_PHONE} is a ${branchUser.role}, not an OWNER. Only OWNERs can be linked as branches.`);
        process.exit(1);
    }

    // 3. Link Branch to HQ
    console.log(`Linking ${branchUser.businessName} to HQ...`);
    branchUser.hqId = hqUser._id as any; // <--- THE LINK
    await branchUser.save();

    console.log(`
    🎉 SUCCESS!
    
    1. Login to **HQ Dashboard** using ${HQ_PHONE}
       -> You will see "${branchUser.businessName}" in your branches list.
       -> You can view aggregated sales and move stock.

    2. Login to **Shop Dashboard** using ${BRANCH_PHONE}
       -> They are still an OWNER.
       -> They see their own shop data as normal.
    `);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

setupHQ();
