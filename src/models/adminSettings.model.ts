import { Schema, model, Document } from 'mongoose';

export interface IAdminSettings extends Document {
  // 🟢 NEW: Public Contact Config
  whatsappUrl?: string; 

  // Ads & Boosts Config
  adsPlans?: {
    id: string;
    durationDays: number;
    price: number; // NGN
    label: string; // e.g. "5 Days Boost"
  }[];

  security: {
    autoSuspendOnJailbreak: boolean;
    maxLoginAttempts: number;
  };
  
  limits: {
    maxMessageHistory: number; // Max messages stored per user (e.g., 5)
    maxStaffAccounts: number; // Max staff per Tycoon user (e.g., 5)
  };
  
  system: {
    maintenanceMode: boolean;
    allowNewRegistrations: boolean;
  };
  
  smtp?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromAddress: string;
    secure: boolean;
  };
  
  updatedAt: Date;
}

const adminSettingsSchema = new Schema<IAdminSettings>(
  {
    // 🟢 ADDING WHATSAPP URL (Root Level)
    whatsappUrl: { type: String, default: '' },

    adsPlans: [{
      id: { type: String, required: true },
      durationDays: { type: Number, required: true },
      price: { type: Number, required: true },
      label: { type: String, required: true }
    }],

    security: {
      autoSuspendOnJailbreak: { type: Boolean, default: true },
      maxLoginAttempts: { type: Number, default: 5 }
    },
    
    limits: {
      maxMessageHistory: { type: Number, default: 5 }, 
      maxStaffAccounts: { type: Number, default: 10 }   
    },
    
    system: {
      maintenanceMode: { type: Boolean, default: false },
      allowNewRegistrations: { type: Boolean, default: true }
    },
    
    smtp: {
      host: { type: String, default: '' },
      port: { type: Number, default: 465 },
      user: { type: String, default: '' },
      pass: { type: String, default: '' },
      fromAddress: { type: String, default: 'notifications@tallypadi.com' },
      secure: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export const AdminSettings = model<IAdminSettings>('AdminSettings', adminSettingsSchema);