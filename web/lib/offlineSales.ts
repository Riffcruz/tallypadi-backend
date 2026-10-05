'use client';

export type OfflineSaleStatus = 'pending' | 'syncing' | 'needs_attention';

export interface OfflineSaleItem {
  itemId: string;
  quantity: number;
  price: number;
  name?: string;
}

export interface OfflineSalePayload {
  clientSaleId: string;
  recordedAt: string;
  offlineCreated: boolean;
  paymentMethod: string;
  customerId?: string;
  discountAmount: number;
  items: OfflineSaleItem[];
}

export interface OfflineSaleRecord {
  queueKey: string;
  userId: string;
  payload: OfflineSalePayload;
  status: OfflineSaleStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface CachedInventoryItem {
  id: string;
  name: string;
  stock: number;
  price: number;
  barcode?: string;
  sku?: string | null;
}

interface CachedInventoryCatalog {
  userId: string;
  items: CachedInventoryItem[];
  updatedAt: string;
}

export type SaleDeliveryResult =
  | { state: 'synced'; data: Record<string, unknown> }
  | { state: 'queued'; message: string }
  | { state: 'needs_attention'; message: string };

const DB_NAME = 'tallypadi-offline-sales';
const DB_VERSION = 2;
const STORE_NAME = 'sales';
const CATALOG_STORE_NAME = 'catalogs';
const CHANGE_EVENT = 'tallypadi:offline-sales-changed';
const requestLocks = new Map<string, Promise<unknown>>();

const emitChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
};

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('Offline storage is not supported by this browser'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => reject(request.error || new Error('Could not open offline sales storage'));
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'queueKey' });
      store.createIndex('userId', 'userId', { unique: false });
    }
    if (!db.objectStoreNames.contains(CATALOG_STORE_NAME)) {
      db.createObjectStore(CATALOG_STORE_NAME, { keyPath: 'userId' });
    }
  };
  request.onsuccess = () => resolve(request.result);
});

const runStoreRequest = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  storeName = STORE_NAME
): Promise<T> => {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('Offline storage operation failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction failed'));
      transaction.oncomplete = () => resolve(result);
    });
  } finally {
    db.close();
  }
};

export const createClientSaleId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `sale_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
};

export const queueOfflineSale = async (userId: string, payload: OfflineSalePayload) => {
  const now = new Date().toISOString();
  const record: OfflineSaleRecord = {
    queueKey: `${userId}:${payload.clientSaleId}`,
    userId,
    payload,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await runStoreRequest('readwrite', (store) => store.add(record));
  } catch (error: unknown) {
    // Reusing the same client sale ID must never overwrite the original sale.
    if (!(error instanceof DOMException && error.name === 'ConstraintError')) throw error;
  }
  emitChange();
  return record;
};

export const listOfflineSales = async (userId: string): Promise<OfflineSaleRecord[]> => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const index = transaction.objectStore(STORE_NAME).index('userId');
      const request = index.getAll(IDBKeyRange.only(userId));
      request.onsuccess = () => resolve((request.result as OfflineSaleRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      request.onerror = () => reject(request.error || new Error('Could not read offline sales'));
    });
  } finally {
    db.close();
  }
};

export const cacheInventoryItems = async (
  userId: string,
  incomingItems: CachedInventoryItem[],
  replace = false
) => {
  if (!userId || (!replace && incomingItems.length === 0)) return;
  const existing = replace ? undefined : await runStoreRequest<CachedInventoryCatalog | undefined>(
    'readonly',
    (store) => store.get(userId),
    CATALOG_STORE_NAME
  );
  const merged = new Map<string, CachedInventoryItem>();
  for (const item of existing?.items || []) merged.set(item.id, item);
  for (const item of incomingItems) merged.set(item.id, item);
  const catalog: CachedInventoryCatalog = {
    userId,
    items: Array.from(merged.values()).slice(-2000),
    updatedAt: new Date().toISOString(),
  };
  await runStoreRequest('readwrite', (store) => store.put(catalog), CATALOG_STORE_NAME);
};

export const readCachedInventory = async (userId: string): Promise<CachedInventoryItem[]> => {
  if (!userId) return [];
  const catalog = await runStoreRequest<CachedInventoryCatalog | undefined>(
    'readonly',
    (store) => store.get(userId),
    CATALOG_STORE_NAME
  );
  return catalog?.items || [];
};

const readSale = (queueKey: string) => runStoreRequest<OfflineSaleRecord | undefined>(
  'readonly',
  (store) => store.get(queueKey)
);

const saveSale = async (record: OfflineSaleRecord) => {
  await runStoreRequest('readwrite', (store) => store.put(record));
  emitChange();
};

const removeSale = async (queueKey: string) => {
  await runStoreRequest('readwrite', (store) => store.delete(queueKey));
  emitChange();
};

const parseResponse = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
};

const messageFrom = (data: Record<string, unknown>, fallback: string) =>
  String(data.error || data.message || fallback);

export const deliverOfflineSale = async (
  queueKey: string,
  token: string,
  apiUrl: string
): Promise<SaleDeliveryResult> => {
  const existingLock = requestLocks.get(queueKey) as Promise<SaleDeliveryResult> | undefined;
  if (existingLock) return existingLock;

  const delivery = (async (): Promise<SaleDeliveryResult> => {
    const record = await readSale(queueKey);
    if (!record) return { state: 'synced', data: { alreadyRemoved: true } };

    const syncingRecord: OfflineSaleRecord = {
      ...record,
      status: 'syncing',
      attempts: record.attempts + 1,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await saveSale(syncingRecord);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${apiUrl}/sales`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': syncingRecord.payload.clientSaleId,
        },
        body: JSON.stringify(syncingRecord.payload),
        signal: controller.signal,
      });
      const data = await parseResponse(response);

      if (response.ok && response.status !== 202 && data.success !== false) {
        await removeSale(queueKey);
        return { state: 'synced', data };
      }

      const message = messageFrom(data, `Sale sync failed (${response.status})`);
      const transient = response.status === 202 || response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      await saveSale({
        ...syncingRecord,
        status: transient ? 'pending' : 'needs_attention',
        updatedAt: new Date().toISOString(),
        lastError: message,
      });
      return transient ? { state: 'queued', message } : { state: 'needs_attention', message };
    } catch (error: unknown) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'The server took too long to respond. The sale is saved and will retry safely.'
        : 'No network connection. The sale is saved and will sync automatically.';
      await saveSale({
        ...syncingRecord,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        lastError: message,
      });
      return { state: 'queued', message };
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  requestLocks.set(queueKey, delivery);
  try {
    return await delivery;
  } finally {
    requestLocks.delete(queueKey);
  }
};

export const submitDurableSale = async (
  userId: string,
  payload: OfflineSalePayload,
  token: string,
  apiUrl: string
) => {
  const record = await queueOfflineSale(userId, payload);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'queued', message: 'Sale saved on this device. It will sync when the connection returns.' } as SaleDeliveryResult;
  }
  return deliverOfflineSale(record.queueKey, token, apiUrl);
};

export const syncOfflineSales = async (userId: string, token: string, apiUrl: string) => {
  const records = await listOfflineSales(userId);
  const pending = records.filter((record) => record.status !== 'needs_attention');
  const results: SaleDeliveryResult[] = [];
  for (const record of pending) {
    results.push(await deliverOfflineSale(record.queueKey, token, apiUrl));
  }
  return results;
};

export const retryOfflineSale = async (queueKey: string, token: string, apiUrl: string) => {
  const record = await readSale(queueKey);
  if (!record) return { state: 'synced', data: { alreadyRemoved: true } } as SaleDeliveryResult;
  await saveSale({ ...record, status: 'pending', updatedAt: new Date().toISOString(), lastError: undefined });
  return deliverOfflineSale(queueKey, token, apiUrl);
};

export const OFFLINE_SALES_CHANGE_EVENT = CHANGE_EVENT;
