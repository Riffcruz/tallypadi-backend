import { Schema, model, Document } from 'mongoose';

export interface IAdminSettings extends Document {
  security: {
    autoSuspendOnJailbreak: boolean;
    maxLoginAttempts: number;
  };
  // 🟢 NEW: System Limits
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
    security: {
      autoSuspendOnJailbreak: { type: Boolean, default: true },
      maxLoginAttempts: { type: Number, default: 5 }
    },
    // 🟢 ADDING NEW LIMITS
    limits: {
      maxMessageHistory: { type: Number, default: 5 }, // Default to 5
      maxStaffAccounts: { type: Number, default: 5 }   // Default to 5
    },
    system: {
      maintenanceMode: { type: Boolean, default: false },
      allowNewRegistrations: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export const AdminSettings = model<IAdminSettings>('AdminSettings', adminSettingsSchema);