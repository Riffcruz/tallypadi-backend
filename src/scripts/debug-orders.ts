import mongoose from 'mongoose';
import { env } from '../config/env';
import { orderService } from '../services/order.service';
import { User } from '../models/user.model';

async function run() {
  await mongoose.connect(env.mongoUri);
  console.log('Connected to DB');

  // Find a user (Owner)
  const user = await User.findOne({ role: 'OWNER' });
  if (!user) {
    console.log('No user found');
    return;
  }
  
  console.log(`Checking orders for user: ${user._id} (${user.phoneNumber})`);

  // Create a dummy order first to ensure data exists
  await orderService.createOrder(user._id, {
      customerName: "Debug Customer",
      description: "Debug Order",
      price: 5000,
      deliveryDate: new Date(),
      status: 'PENDING'
  });
  console.log('Created dummy order');

  const { orders } = await orderService.getOrders(user._id, { status: 'PENDING' });
  console.log(`Found ${orders.length} pending orders:`);
  orders.forEach(o => {
      console.log(`- ${o.customerName}: ${o.description} (${o.status})`);
  });

  process.exit(0);
}

run().catch(console.error);
