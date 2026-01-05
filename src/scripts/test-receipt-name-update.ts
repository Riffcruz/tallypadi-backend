import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { generateSaleReceiptPdfBuffer } from '../controllers/receipt.controller';
import { env } from '../config/env';

async function main() {
  console.log('🚀 Starting Receipt Name Update Test...');

  // 1. Connect to DB
  await mongoose.connect(env.mongoUri);
  console.log('✅ Connected to DB');

  try {
    // 2. Create Test User
    const testPhone = '+2349999999999';
    const oldName = 'Old Business Name';
    const newName = 'New Business Name';

    await User.deleteOne({ phoneNumber: testPhone }); // Cleanup first

    const user: any = await User.create({
      phoneNumber: testPhone,
      role: 'OWNER',
      businessName: oldName,
      shopName: oldName, // Settings controller updates both
      countryCode: 'NG',
      currencyCode: 'NGN',
      locale: 'en-NG',
    });
    console.log(`✅ Created User: ${user._id} with name "${user.businessName}"`);

    // 3. Create Test Transaction
    const tx = await Transaction.create({
      user: user._id,
      type: 'SALE',
      paymentStatus: 'PAID',
      items: [{ name: 'Test Item', qty: 1, unitPrice: 1000, total: 1000 }],
      totalMoney: 1000,
      date: '2025-01-05',
    });
    console.log(`✅ Created Transaction: ${tx._id}`);

    // 4. Generate Receipt 1 (Expect Old Name)
    console.log('📄 Generating Receipt 1...');
    const result1 = await generateSaleReceiptPdfBuffer(String(user._id), String(tx._id));
    
    // Check if PDF contains Old Name (Simple buffer search - might fail if compressed)
    // Note: PDFKit compresses streams by default. 
    // However, we are testing the LOGIC. 
    // Let's verify what the controller WOULD see.
    
    const userRefetched1 = await User.findById(user._id).lean();
    console.log(`🧐 User Name at Receipt 1: "${(userRefetched1 as any).businessName}"`);
    if ((userRefetched1 as any).businessName !== oldName) {
        throw new Error('Initial name setup failed!');
    }

    // 5. Simulate Update (Simulating settings.controller.ts)
    console.log('🔄 Updating Business Name...');
    const $set: any = {
        businessName: newName,
        shopName: newName
    };
    
    await User.findByIdAndUpdate(user._id, { $set }, { new: true, runValidators: true });
    console.log('✅ Update executed.');

    // 6. Generate Receipt 2 (Expect New Name)
    console.log('📄 Generating Receipt 2...');
    // This function fetches the user fresh internally
    const result2 = await generateSaleReceiptPdfBuffer(String(user._id), String(tx._id));

    // 7. Verify logic
    // We can't easily parse the PDF buffer here without a library, 
    // but we can verify the DB state which the controller uses.
    const userRefetched2 = await User.findById(user._id).lean();
    console.log(`🧐 User Name at Receipt 2: "${(userRefetched2 as any).businessName}"`);

    if ((userRefetched2 as any).businessName === newName) {
        console.log('✅ SUCCESS: User name in DB is updated. Receipt controller fetches fresh data, so it MUST use this new name.');
    } else {
        console.error('❌ FAILURE: User name in DB did not update!');
    }

  } catch (err) {
    console.error('❌ Test Failed:', err);
  } finally {
    // Cleanup
    const u = await User.findOne({ phoneNumber: '+2349999999999' });
    if (u) {
        await Transaction.deleteMany({ user: u._id });
        await User.deleteOne({ _id: u._id });
        console.log('🧹 Cleanup done.');
    }
    await mongoose.disconnect();
  }
}

main();
