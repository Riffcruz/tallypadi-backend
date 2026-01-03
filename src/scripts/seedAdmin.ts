import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { env } from '../config/env';

async function main() {
  const phoneNumber = process.env.ADMIN_PHONE_NUMBER!;
  const password = process.env.ADMIN_PASSWORD!;
  const email = process.env.ADMIN_EMAIL || undefined;

  if (!phoneNumber || !password) {
    throw new Error('Set ADMIN_PHONE_NUMBER and ADMIN_PASSWORD in .env');
  }

  await mongoose.connect(env.mongoUri);

  const hashed = await bcrypt.hash(password, 12);

  const existing = await User.findOne({ phoneNumber }).select('+password');

  if (existing) {
    existing.role = 'ADMIN' as any;
    existing.password = hashed;
    existing.registrationStage = 'COMPLETED';
    existing.subscriptionStatus = 'active' as any;
    if (email) existing.email = email;
    await existing.save();
    console.log('✅ Admin updated:', phoneNumber);
  } else {
    await User.create({
      phoneNumber,
      email,
      password: hashed,
      role: 'ADMIN',
      registrationStage: 'COMPLETED',
      subscriptionStatus: 'active',
      planType: 'TYCOON',
      businessName: 'TallyPadi Admin',
      countryCode: 'NG',
    });
    console.log('✅ Admin created:', phoneNumber);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
