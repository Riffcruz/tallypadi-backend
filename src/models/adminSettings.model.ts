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

  referralProgram?: {
    enabled: boolean;
    minimumFundingAmount: number; // NGN
    rewardPercentage: number;
  };

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
  
  globalEmailTemplate?: string;

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

    referralProgram: {
      enabled: { type: Boolean, default: true },
      minimumFundingAmount: { type: Number, default: 10000 },
      rewardPercentage: { type: Number, default: 10 },
    },

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
    },
    
    globalEmailTemplate: { 
      type: String, 
      default: '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 20px; border-radius: 8px;">\n  <div style="text-align: center; margin-bottom: 20px;">\n    <h1 style="color: #1e293b; margin: 0;">TallyPadi</h1>\n  </div>\n  <div style="color: #334155; line-height: 1.6;">\n    {{message}}\n  </div>\n  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">\n    &copy; TallyPadi. All rights reserved.\n  </div>\n</div>'
    }
  },
  { timestamps: true }
);

export const AdminSettings = model<IAdminSettings>('AdminSettings', adminSettingsSchema);
