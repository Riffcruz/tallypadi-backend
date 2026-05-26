import { getSharedRedisClient } from './redis.service';

export type MarketplaceCacheAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
};

export type CacheResult<T> = {
  value: T;
  status: 'hit' | 'miss' | 'stale';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const safe = async <T>(operation: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation;
  } catch {
    return fallback;
  }
};

export const redisMarketplaceCacheAdapter: MarketplaceCacheAdapter = {
  async get(key) {
    return getSharedRedisClient('marketplace-cache').get(key);
  },
  async set(key, value, ttlSeconds) {
    await getSharedRedisClient('marketplace-cache').set(key, value, 'EX', ttlSeconds);
  },
  async setNx(key, value, ttlSeconds) {
    const result = await getSharedRedisClient('marketplace-cache').set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  },
  async del(key) {
    await getSharedRedisClient('marketplace-cache').del(key);
  },
  async incr(key) {
    return getSharedRedisClient('marketplace-cache').incr(key);
  },
};

export const createMemoryMarketplaceCacheAdapter = (): MarketplaceCacheAdapter => {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  const read = (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };

  return {
    async get(key) {
      return read(key);
    },
    async set(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async setNx(key, value, ttlSeconds) {
      if (read(key) !== null) return false;
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    async del(key) {
      store.delete(key);
    },
    async incr(key) {
      const next = Number(read(key) || '0') + 1;
      store.set(key, { value: String(next), expiresAt: null });
      return next;
    },
  };
};

export const withJsonCache = async <T>({
  key,
  ttlSeconds,
  staleSeconds,
  lockSeconds = 10,
  adapter = redisMarketplaceCacheAdapter,
  loader,
}: {
  key: string;
  ttlSeconds: number;
  staleSeconds: number;
  lockSeconds?: number;
  adapter?: MarketplaceCacheAdapter;
  loader: () => Promise<T>;
}): Promise<CacheResult<T>> => {
  let liveRaw: string | null;
  try {
    liveRaw = await adapter.get(key);
  } catch {
    return { value: await loader(), status: 'miss' };
  }

  const live = parseJson<T>(liveRaw);
  if (live !== null) return { value: live, status: 'hit' };

  const lockKey = `${key}:lock`;
  const staleKey = `${key}:stale`;
  let hasLock = false;

  try {
    hasLock = await adapter.setNx(lockKey, '1', lockSeconds);
  } catch {
    return { value: await loader(), status: 'miss' };
  }

  if (!hasLock) {
    const stale = parseJson<T>(await safe(adapter.get(staleKey), null));
    if (stale !== null) return { value: stale, status: 'stale' };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(125);
      const retry = parseJson<T>(await safe(adapter.get(key), null));
      if (retry !== null) return { value: retry, status: 'hit' };
    }
  }

  const staleBeforeLoad = parseJson<T>(await safe(adapter.get(staleKey), null));

  try {
    const value = await loader();
    const payload = JSON.stringify(value);
    await safe(adapter.set(key, payload, ttlSeconds), undefined);
    await safe(adapter.set(staleKey, payload, staleSeconds), undefined);
    return { value, status: 'miss' };
  } catch (error) {
    if (staleBeforeLoad !== null) return { value: staleBeforeLoad, status: 'stale' };
    throw error;
  } finally {
    if (hasLock) await safe(adapter.del(lockKey), undefined);
  }
};

export const getMarketplaceCacheVersion = async () => {
  return (await safe(redisMarketplaceCacheAdapter.get('marketplace:v2:version'), null)) || '1';
};

export const invalidateMarketplaceCache = async () => {
  await safe(redisMarketplaceCacheAdapter.incr('marketplace:v2:version'), 0);
  await safe(redisMarketplaceCacheAdapter.del('marketplace:v2:facets'), undefined);
};

export const setMarketplaceJson = async (key: string, value: unknown, ttlSeconds: number) => {
  await safe(redisMarketplaceCacheAdapter.set(key, JSON.stringify(value), ttlSeconds), undefined);
};

export const getMarketplaceJson = async <T>(key: string) => {
  return parseJson<T>(await safe(redisMarketplaceCacheAdapter.get(key), null));
};
