import mongoose from 'mongoose';
import { env } from '../config/env';

const clearDatabase = async () => {
  try {
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(env.mongoUri);
    console.log('✅ Connected.');

    // ✅ FIX: Check if db exists first
    if (mongoose.connection.db) {
      console.log('🗑️ Dropping database...');
      await mongoose.connection.db.dropDatabase();
      console.log('✨ Database cleared successfully!');
    } else {
      console.error('❌ Database connection instance is missing.');
    }

  } catch (err) {
    console.error('❌ Error clearing database:', err);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Connection closed.');
    process.exit(0);
  }
};

clearDatabase();