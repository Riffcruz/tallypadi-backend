import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { getSharedRedisClient } from './redis.service';

export class RedisRateLimitStore implements Store {
  public localKeys = false;
  public prefix: string;
  private windowMs = 60_000;
  private readonly clientName: string;

  constructor(prefix: string) {
    this.prefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
    this.clientName = `rate-limit-${this.prefix.replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'default'}`;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getSharedRedisClient(this.clientName);
    const redisKey = `${this.prefix}${key}`;
    const totalHits = await redis.incr(redisKey);
    let ttlMs = await redis.pttl(redisKey);

    if (totalHits === 1 || ttlMs < 0) {
      await redis.pexpire(redisKey, this.windowMs);
      ttlMs = this.windowMs;
    }

    return {
      totalHits,
      resetTime: new Date(Date.now() + Math.max(ttlMs, 0)),
    };
  }

  async decrement(key: string): Promise<void> {
    const redis = getSharedRedisClient(this.clientName);
    const redisKey = `${this.prefix}${key}`;
    const value = await redis.decr(redisKey);
    if (value <= 0) await redis.del(redisKey);
  }

  async resetKey(key: string): Promise<void> {
    const redis = getSharedRedisClient(this.clientName);
    await redis.del(`${this.prefix}${key}`);
  }
}
