import { Schema, model, Document } from 'mongoose';

export interface IDeletedItem extends Document {
  user: Schema.Types.ObjectId;
  name: string;
  quantity: number;
  deletedAt: Date;
}

const deletedItemSchema = new Schema<IDeletedItem>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const DeletedItem = model<IDeletedItem>('DeletedItem', deletedItemSchema);
