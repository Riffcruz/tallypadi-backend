// src/models/order.model.ts
import { Schema, model, Document, Types } from 'mongoose';
import type { IUser } from './user.model';

export const ORDER_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IOrder extends Document {
  user: Types.ObjectId | IUser;

  description: string;
  customerName: string;
  customerPhone?: string | null;

  price: number;
  amountPaid: number;
  balance: number;

  deliveryDate: Date;

  status: OrderStatus;

  reminderSent: boolean;

  createdAt: Date;
  updatedAt: Date;

  messageId?: string | null;
}

const orderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
      index: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
      index: true,
    },

    customerPhone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32,
      validate: {
        validator: (v: string | null) => {
          if (v == null) return true;
          const s = String(v).trim();
          if (!s) return true;
          return /^[+]?[\d\s\-()]{7,32}$/.test(s);
        },
        message: 'Invalid phone format',
      },
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      max: 1_000_000_000,
      default: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
      max: 1_000_000_000,
    },

    balance: {
      type: Number,
      default: 0,
      min: 0,
      max: 1_000_000_000,
      index: true,
    },

    deliveryDate: {
      type: Date,
      required: true,
      index: true,
      validate: {
        validator: (d: Date) => d instanceof Date && !Number.isNaN(d.getTime()),
        message: 'Invalid deliveryDate',
      },
    },

    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'PENDING',
      index: true,
    },

    reminderSent: {
      type: Boolean,
      default: false,
      index: true,
    },

    messageId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: 128,
    },
  },
  {
    timestamps: true,
    strict: 'throw', // ✅ blocks extra/untrusted fields
    versionKey: false,
  }
);

// ✅ Balance logic (sync middleware, no `next` => no TS overload issues)
orderSchema.pre('validate', function () {
  const doc = this as IOrder;

  const price = Number(doc.price ?? 0);
  const paid = Number(doc.amountPaid ?? 0);

  if (Number.isFinite(price)) doc.price = Math.max(0, price);
  if (Number.isFinite(paid)) doc.amountPaid = Math.max(0, paid);

  if (Number.isFinite(doc.price) && Number.isFinite(doc.amountPaid)) {
    const effectivePaid = Math.min(doc.amountPaid, doc.price);
    doc.balance = Math.max(0, doc.price - effectivePaid);
  }
});

// useful indexes for your queries
orderSchema.index({ user: 1, deliveryDate: 1 });
orderSchema.index({ user: 1, status: 1, deliveryDate: 1 });

export const Order = model<IOrder>('Order', orderSchema);
