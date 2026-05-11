import { Schema, model, Document } from 'mongoose';

export interface IOutboxEvent extends Document {
  eventType: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  attempts: number;
  nextRetryAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const outboxEventSchema = new Schema<IOutboxEvent>(
  {
    eventType: { type: String, required: true, trim: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'], default: 'PENDING', index: true },
    attempts: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export const OutboxEvent = model<IOutboxEvent>('OutboxEvent', outboxEventSchema);
