import { Schema, model, Document } from 'mongoose';

export interface IAdminSettings extends Document {
  // 🟢 NEW: Public Contact Config
  whatsappUrl?: string; 

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
  
  updatedAt: Date;
}

const adminSettingsSchema = new Schema<IAdminSettings>(
  {
    // 🟢 ADDING WHATSAPP URL (Root Level)
    whatsappUrl: { type: String, default: '' },

    security: {
      autoSuspendOnJailbreak: { type: Boolean, default: true },
      maxLoginAttempts: { type: Number, default: 5 }
    },
    
    limits: {
      maxMessageHistory: { type: Number, default: 5 }, 
      maxStaffAccounts: { type: Number, default: 5 }   
    },
    
    system: {
      maintenanceMode: { type: Boolean, default: false },
      allowNewRegistrations: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export const AdminSettings = model<IAdminSettings>('AdminSettings', adminSettingsSchema);