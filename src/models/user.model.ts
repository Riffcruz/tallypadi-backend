import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  phoneNumber: string;
  email?: string;
  password?: string;

  registrationStage?: 'EMAIL' | 'PASSWORD' | 'SHOP_NAME_SELECTION' | 'SHOP_NAME_INPUT' | 'COMPLETED';
  businessName?: string;
  name?: string;

  countryCode?: string; // 'NG', 'US', etc.

  // Subscription Fields
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  trialEndsAt?: Date;
  nextBillingDate?: Date;
  paystackCustomerCode?: string;
  paystackPlanCode?: string;

  shopSlug?: string; // unique URL part for tallypadi.com/shop/:slug
  shopDescription?: string; 
  heroImageUrl?: string;

  nextSummaryAt?: Date | null;        // UTC date when next summary should run
  lastSummaryDateKey?: string | null; // YYYY-MM-DD for last summary sent (user-local day)

  // Plan & Staff Fields
  planType?: 'OGA_BOSS' | 'TYCOON';
  // interface
  role?: 'OWNER' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN' | 'INVESTOR' | 'HQ';
  isHqManager?: boolean;
  ownerId?: Types.ObjectId;
  hqId?: Types.ObjectId;

  messageHistory?: string[];

  settings?: {
    closingTime: string;
    utcOffsetMinutes: number;
    dailySummaryEnabled: boolean;
    language: string;
    pdfReportsEnabled: boolean;
    staffTransactionReport?: boolean;
    
    // ✅ Staff Permissions
    staffPermissions?: {
       canViewDashboard?: boolean;
       canManageInventory?: boolean;
       canViewSalesHistory?: boolean;
       canViewReports?: boolean;
       canManageCustomers?: boolean;
       canViewSettings?: boolean;
    };

    // ✅ Royalty / Loyalty Program Settings
    royalty?: {
      enabled: boolean;
      pointsPerPurchase: number; // e.g., 1 point per 1000 NGN spent
      currencyValuePerPoint: number; // e.g., 1 point = 10 NGN when redeeming
      redemptionValuePerPoint: number; // e.g., 1 point gives 1 NGN discount
    };
  };

  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };

  expenseCategories?: string[];

  // ✅ Security / Suspension
  suspendedAt?: Date;
  suspensionReason?: string;
  security?: {
    injectionStrikes: number;
    lastInjectionAt?: Date | null;
  };

  interactionState?: {
    type: string | null;
    data?: any;
  };

  lastLogin?: Date;
  lastSeen?: Date;

  otp?: string;
  otpExpires?: Date;
  tempPhone?: string;

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
      enum: ['EMAIL', 'PASSWORD', 'SHOP_NAME_SELECTION', 'SHOP_NAME_INPUT', 'COMPLETED'],
      default: 'EMAIL',
    },

    businessName: { type: String, default: 'My Shop' },
    name: { type: String, default: 'Staff' },

    nextSummaryAt: { type: Date, default: null, index: true },
    lastSummaryDateKey: { type: String, default: null, index: true },

    countryCode: {
      type: String,
      default: 'NG',
      uppercase: true,
      trim: true,
      maxLength: 3,
    },

    // Subscription Defaults
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled', 'suspended'],
      default: 'trial',
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    nextBillingDate: { type: Date },
    paystackCustomerCode: { type: String },
    paystackPlanCode: { type: String },
    
    shopSlug: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    shopDescription: { type: String, maxLength: 500 },
    heroImageUrl: { type: String },

    planType: {
      type: String,
      enum: ['OGA_BOSS', 'TYCOON'],
      default: 'TYCOON',
    },

    // schema
  role: {
    type: String,
    enum: ['OWNER', 'STAFF', 'ADMIN', 'SUPER_ADMIN', 'INVESTOR', 'HQ'],
    default: 'OWNER',
  },
  isHqManager: { type: Boolean, default: false },


    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    hqId: { type: Schema.Types.ObjectId, ref: 'User' },

    messageHistory: { type: [String], default: [] },

    settings: {
      closingTime: { type: String, default: '20:00' },
      utcOffsetMinutes: { type: Number, default: 60 },
      dailySummaryEnabled: { type: Boolean, default: false },
      language: { type: String, default: 'English' },
      pdfReportsEnabled: { type: Boolean, default: true },
      staffTransactionReport: { type: Boolean, default: false },
      
      // ✅ Staff Permission Toggles (Controlled by Owner)
      staffPermissions: {
         canViewDashboard: { type: Boolean, default: false },     // See main stats
         canManageInventory: { type: Boolean, default: true },    // Add/Edit products
         canViewSalesHistory: { type: Boolean, default: false },  // See all shop sales
         canViewReports: { type: Boolean, default: false },       // Access reports page
         canManageCustomers: { type: Boolean, default: true },    // Access debtors
         canViewSettings: { type: Boolean, default: false },      // Access settings page
      },

      // ✅ Royalty Program Config
      royalty: {
        enabled: { type: Boolean, default: false },
        pointsPerPurchase: { type: Number, default: 0 },
        currencyValuePerPoint: { type: Number, default: 0 }
      }
    },

    // ✅ Bank Details for Invoices
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountName: { type: String },
    },

    // ✅ Expense Categories
    expenseCategories: { 
      type: [String], 
      default: ['General', 'Rent', 'Utilities', 'Salaries', 'Restocking', 'Miscellaneous'] 
    },

    // ✅ Security / Suspension
    suspendedAt: { type: Date },
    suspensionReason: { type: String },
    security: {
      injectionStrikes: { type: Number, default: 0 },
      lastInjectionAt: { type: Date, default: null },
    },
    
    // ✅ Interaction State (for multi-step flows like "Ask Name")
    interactionState: {
      type: { type: String, default: null },
      data: { type: Schema.Types.Mixed, default: null }
    },

    lastLogin: { type: Date },
    lastSeen: { type: Date },

    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    tempPhone: { type: String, select: false },
  },
  { timestamps: true }
);

// Helpful index for summary workers
userSchema.index({ 'settings.dailySummaryEnabled': 1, nextSummaryAt: 1 });

// Optional: find staff by owner quickly
userSchema.index({ ownerId: 1, role: 1 });

export const User = model<IUser>('User', userSchema);
