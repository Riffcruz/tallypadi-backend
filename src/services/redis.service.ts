import IORedis, { Redis, RedisOptions } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const clients = new Map<string, Redis>();

export const getSharedRedisClient = (name: string, options: RedisOptions = {}) => {
  const existing = clients.get(name);
  if (existing) return existing;

  const redis = new IORedis(redisUrl, {
    connectionName: name,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    ...options,
  });

  redis.on('connect', () => console.log(`✅ Redis [${name}] connected`));
  redis.on('error', (err) => console.error(`❌ Redis [${name}] error:`, err.message));
  redis.on('close', () => console.warn(`⚠️ Redis [${name}] disconnected`));

  clients.set(name, redis);
  return redis;
};

export const closeSharedRedisClients = async () => {
  await Promise.all(Array.from(clients.values()).map((client) => client.quit().catch(() => undefined)));
  clients.clear();
};
