import mongoose from 'mongoose';
import { env } from '../config/env';
import { orderService } from '../services/order.service';
import { User } from '../models/user.model';
import { Order } from '../models/order.model';

async function run() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.mongoUri);
      console.log('✅ Connected to DB');
    }

    // 1. Find an owner
    const owner = await User.findOne({ role: 'OWNER' });
    if (!owner) {
      console.error('❌ No owner found');
      process.exit(1);
    }
    console.log(`👤 Testing with user: ${owner._id} (${owner.businessName})`);

    // 2. Clear existing orders for clean test
    await Order.deleteMany({ user: owner._id });
    console.log('🧹 Cleared orders');

    // 3. Create a test order
    console.log('📝 Creating test order...');
    const order = await orderService.createOrder(owner._id, {
      customerName: 'Test Customer',
      description: 'Test Item',
      price: 5000,
      amountPaid: 0,
      deliveryDate: new Date(),
      status: 'PENDING'
    });
    console.log('✅ Order created:', order._id);

    // 4. Simulate LIST_ORDERS controller logic
    console.log('🔍 calling getOrders...');
    const { orders } = await orderService.getOrders(owner._id, { status: 'PENDING' });
    console.log(`📦 Retrieved ${orders.length} orders`);

    if (!orders.length) {
      console.log('⚠️ No pending orders (unexpected)');
    } else {
      let msg = "📋 *Pending Orders*:\n\n";
      orders.forEach((o: any) => {
        try {
          const dDate = new Date(o.deliveryDate);
          const bal = Number(o.balance || 0);
          console.log(`Processing order: ${o._id}, Bal: ${bal}`);
          msg += `• *${o.customerName}* - ${o.description}\n  📅 Due: ${dDate.toDateString()}\n  💰 Bal: ₦${bal.toLocaleString()}\n\n`;
        } catch (err) {
          console.error('❌ Error formatting order:', err);
        }
      });
      console.log('✅ Final Message:\n', msg);
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
