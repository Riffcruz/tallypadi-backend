import { Schema, model, Document, Types } from 'mongoose';
import { IUser } from './user.model';

export interface IOrder extends Document {
  user: Types.ObjectId | IUser;
  
  description: string; // The "Order's name" or items
  customerName: string;
  customerPhone?: string; // Optional contact
  
  price: number;
  amountPaid: number;
  balance: number;
  
  deliveryDate: Date;
  
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
  
  reminderSent: boolean;
  
  // Meta
  createdAt: Date;
  updatedAt: Date;
  messageId?: string; // For WhatsApp linkage
}

const orderSchema = new Schema<IOrder>(
  {
    user: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    description: { 
      type: String, 
      required: true 
    },
    customerName: { 
      type: String, 
      required: true,
      index: true
    },
    customerPhone: {
        type: String,
        default: null
    },
    price: { 
      type: Number, 
      required: true,
      default: 0
    },
    amountPaid: { 
      type: Number, 
      default: 0 
    },
    balance: { 
      type: Number, 
      default: 0 
    },
    deliveryDate: { 
      type: Date, 
      required: true,
      index: true
    },
    status: { 
      type: String, 
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'CANCELLED'], 
      default: 'PENDING',
      index: true
    },
    reminderSent: { 
      type: Boolean, 
      default: false,
      index: true
    },
    messageId: { 
      type: String, 
      unique: true, 
      sparse: true 
    },
  },
  { timestamps: true }
);

// Middleware to calculate balance before save
orderSchema.pre('save', function () {
    if (this.isModified('price') || this.isModified('amountPaid')) {
        this.balance = this.price - this.amountPaid;
    }
});

export const Order = model<IOrder>('Order', orderSchema);