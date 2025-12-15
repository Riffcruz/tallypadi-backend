import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// 1. Force load .env from project root
const envPath = path.resolve(process.cwd(), '.env');
console.log(`📂 Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

// Import Models
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';

const reset = async () => {
  // 2. Check for both common naming conventions
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ Error: Could not find MONGO_URI or MONGODB_URI in .env file.");
    console.log("Loaded Environment Keys:", Object.keys(process.env).filter(k => !k.startsWith('npm_')));
    process.exit(1);
  }

  console.log(`🔗 Connecting to database...`);

  try {
    await mongoose.connect(uri);
    console.log('🔥 Connected. Deleting all data...');

    await User.deleteMany({});
    await Transaction.deleteMany({});
    await Inventory.deleteMany({});

    console.log('✅ Database Cleared! It is brand new now.');
    process.exit(0);
  } catch (err) {
    console.error("❌ Database Error:", err);
    process.exit(1);
  }
};

reset();