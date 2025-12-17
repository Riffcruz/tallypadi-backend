import { Schema, model, Document } from 'mongoose';

export interface ILock extends Document {
  itemId: Schema.Types.ObjectId;
}

const lockSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, required: true, unique: true },
}, { timestamps: true });

lockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 });

export const Lock = model<ILock>('Lock', lockSchema);
