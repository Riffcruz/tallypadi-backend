import { Document, Schema, model } from 'mongoose';

export interface IWhatsAppInboundEvent extends Document {
  messageId: string;
  from: string;
  rawBody: Record<string, unknown>;
  status: 'RECEIVED' | 'QUEUED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  lastError?: string | null;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const whatsappInboundEventSchema = new Schema<IWhatsAppInboundEvent>(
  {
    messageId: { type: String, required: true, unique: true, index: true },
    from: { type: String, required: true, index: true },
    rawBody: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED'],
      default: 'RECEIVED',
      index: true,
    },
    lastError: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

whatsappInboundEventSchema.index({ status: 1, updatedAt: 1 });

export const WhatsAppInboundEvent = model<IWhatsAppInboundEvent>(
  'WhatsAppInboundEvent',
  whatsappInboundEventSchema,
);
