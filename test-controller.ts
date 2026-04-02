import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { updateGlobalSettingsSchema, updateGlobalSettings } from './src/controllers/admin.controller';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventorybot');
    console.log("Connected DB");

    const req = {
        body: {
            whatsappUrl: "test",
            maxMessageHistory: 5,
            maxStaffAccounts: 5,
            autoSuspendOnJailbreak: false,
            smtp: {
                host: "smtp.gmail.com",
                port: null,
                user: "test",
                pass: "test",
                fromAddress: "test",
                secure: true
            }
        }
    } as any;

    const res = {
        status: (code: number) => ({
            json: (data: any) => console.log("STATUS", code, data)
        }),
        json: (data: any) => console.log("JSON", data)
    } as any;

    try {
        await updateGlobalSettings(req, res);
    } catch (e) {
        console.error("CATCH", e);
    }
    
    process.exit(0);
}
run();
