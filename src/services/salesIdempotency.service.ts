import { createHash } from 'crypto';
import { SaleSubmission } from '../models/saleSubmission.model';

export class SaleRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'SaleRequestError';
  }
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const nextValue = (value as Record<string, unknown>)[key];
        if (nextValue !== undefined) result[key] = canonicalize(nextValue);
        return result;
      }, {});
  }
  return value;
};

export const normalizeClientSaleId = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const id = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{11,127}$/.test(id)) {
    throw new SaleRequestError('Invalid client sale ID', 'INVALID_CLIENT_SALE_ID', 400);
  }
  return id;
};

export const parseClientRecordedAt = (value: unknown): Date => {
  if (value === undefined || value === null || value === '') return new Date();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new SaleRequestError('Invalid sale time', 'INVALID_RECORDED_AT', 400);
  }

  const now = Date.now();
  if (parsed.getTime() > now + 10 * 60 * 1000) {
    throw new SaleRequestError('Sale time is too far in the future', 'INVALID_RECORDED_AT', 400);
  }
  if (parsed.getTime() < now - 90 * 24 * 60 * 60 * 1000) {
    throw new SaleRequestError('Offline sale is older than 90 days', 'OFFLINE_SALE_TOO_OLD', 400);
  }
  return parsed;
};

export const buildSalePayloadHash = (payload: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');

export type SaleSubmissionClaim =
  | { acquired: true }
  | { acquired: false; status: 'PROCESSING' | 'COMPLETED'; transactionId?: string };

export class SalesIdempotencyService {
  static async claim(userId: string, clientSaleId: string, payloadHash: string): Promise<SaleSubmissionClaim> {
    const now = new Date();
    try {
      await SaleSubmission.create({
        user: userId,
        clientSaleId,
        payloadHash,
        status: 'PROCESSING',
        lockedAt: now,
        attempts: 1,
      });
      return { acquired: true };
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'code' in error && Number((error as { code?: unknown }).code) === 11000)) {
        throw error;
      }
    }

    const existing = await SaleSubmission.findOne({ user: userId, clientSaleId });
    if (!existing) throw new Error('Could not read the existing sale submission');
    if (existing.payloadHash !== payloadHash) {
      throw new SaleRequestError(
        'This sale ID was already used with different details',
        'IDEMPOTENCY_KEY_REUSED',
        409
      );
    }
    if (existing.status === 'COMPLETED') {
      return {
        acquired: false,
        status: 'COMPLETED',
        transactionId: existing.transactionId ? String(existing.transactionId) : undefined,
      };
    }

    const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
    const reclaimed = await SaleSubmission.findOneAndUpdate(
      {
        _id: existing._id,
        payloadHash,
        $or: [{ status: 'FAILED' }, { status: 'PROCESSING', lockedAt: { $lt: staleBefore } }],
      },
      {
        $set: { status: 'PROCESSING', lockedAt: now, lastError: null },
        $inc: { attempts: 1 },
      },
      { new: true }
    );

    if (reclaimed) return { acquired: true };
    return { acquired: false, status: 'PROCESSING' };
  }

  static async complete(userId: string, clientSaleId: string, transactionId: string) {
    await SaleSubmission.updateOne(
      { user: userId, clientSaleId },
      {
        $set: {
          status: 'COMPLETED',
          transactionId,
          lastError: null,
          lockedAt: new Date(),
        },
      }
    );
  }

  static async fail(userId: string, clientSaleId: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Sale processing failed';
    await SaleSubmission.updateOne(
      { user: userId, clientSaleId },
      {
        $set: {
          status: 'FAILED',
          lastError: message.slice(0, 500),
          lockedAt: new Date(),
        },
      }
    ).catch(() => undefined);
  }
}
