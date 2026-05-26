import mongoose from 'mongoose';
import { env } from './env';

const numberFromEnv = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const mongoConnectionOptions = {
  serverSelectionTimeoutMS: numberFromEnv('MONGO_SERVER_SELECTION_TIMEOUT_MS', 30_000),
  connectTimeoutMS: numberFromEnv('MONGO_CONNECT_TIMEOUT_MS', 30_000),
  socketTimeoutMS: numberFromEnv('MONGO_SOCKET_TIMEOUT_MS', 60_000),
  maxIdleTimeMS: numberFromEnv('MONGO_MAX_IDLE_TIME_MS', 60_000),
  maxPoolSize: numberFromEnv('MONGO_MAX_POOL_SIZE', 100),
  minPoolSize: numberFromEnv('MONGO_MIN_POOL_SIZE', 10),
};

export const connectDb = async () => {
  try {
    mongoose.set('bufferCommands', false);
    await mongoose.connect(env.mongoUri, mongoConnectionOptions);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error', err);
    process.exit(1);
  }
};
