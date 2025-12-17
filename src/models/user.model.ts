import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  phoneNumber: string;
  email?: string;
  password?: string;
  registrationStage: 'EMAIL' | 'PASSWORD' | 'COMPLETED';
  businessName?: string; 
  name?: string;
  countryCode: string; // 🟢 ADDED: Stores 'NG', 'US', etc.
  
  // Subscription Fields
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  trialEndsAt: Date;
  nextBillingDate?: Date;
  paystackCustomerCode?: string;
  paystackPlanCode?: string;
  nextSummaryAt?: Date | null;      // UTC date when next summary should run
  lastSummaryDateKey?: string | null; // YYYY-MM-DD for last summary sent (user-local day)


  // Plan & Staff Fields
  planType: 'OGA_BOSS' | 'TYCOON'; 
  role: 'OWNER' | 'STAFF';
  ownerId?: Types.ObjectId;
  messageHistory: string[];

  settings: {
    closingTime: string;
    utcOffsetMinutes: number;
    dailySummaryEnabled: boolean;
    language: string;
    pdfReportsEnabled: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    phoneNumber: { type: String, required: true, unique: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    registrationStage: { 
      type: String, 
      enum: ['EMAIL', 'PASSWORD', 'COMPLETED'], 
      default: 'EMAIL' 
    },
    businessName: { type: String, default: "My Shop" },
    name: { type: String },
    nextSummaryAt: { type: Date, default: null, index: true },
    lastSummaryDateKey: { type: String, default: null, index: true },

    
    // 🟢 ADDED: Country Code Field
    countryCode: { 
        type: String, 
        default: 'NG', // Default to Nigeria
        uppercase: true,
        trim: true,
        maxLength: 3
    },
    
    // Subscription Defaults
    subscriptionStatus: { 
        type: String, 
        enum: ['trial', 'active', 'past_due', 'cancelled', 'suspended'], 
        default: 'trial' 
    },
    trialEndsAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
    },
    nextBillingDate: Date,
    paystackCustomerCode: String,
    paystackPlanCode: String,

    planType: { 
        type: String, 
        enum: ['OGA_BOSS', 'TYCOON'], 
        default: 'OGA_BOSS' 
    },
    role: {
        type: String,
        enum: ['OWNER', 'STAFF'],
        default: 'OWNER'
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    
    messageHistory: { type: [String], default: [] },
    

    settings: {
      closingTime: { type: String, default: '20:00' },
      utcOffsetMinutes: { type: Number, default: 60 },
      dailySummaryEnabled: { type: Boolean, default: false },
      language: { type: String, default: 'English' },
      pdfReportsEnabled: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

userSchema.index({ 'settings.dailySummaryEnabled': 1, nextSummaryAt: 1 });

export const User = model<IUser>('User', userSchema);