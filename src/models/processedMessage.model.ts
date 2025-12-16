import { Schema, model, Document, Types } from 'mongoose';

export interface IProcessedMessage extends Document {
  user: Types.ObjectId;
  messageId: string;
  status: 'PROCESSING' | 'DONE' | 'FAILED';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const processedMessageSchema = new Schema<IProcessedMessage>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['PROCESSING', 'DONE', 'FAILED'], default: 'PROCESSING' },
    error: { type: String, default: null }
  },
  { timestamps: true }
);

export const ProcessedMessage = model<IProcessedMessage>('ProcessedMessage', processedMessageSchema);
