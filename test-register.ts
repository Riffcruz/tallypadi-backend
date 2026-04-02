import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { registerUser } from './src/controllers/auth.controller';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventorybot');
    console.log("Connected DB");

    const req = {
        body: {
            phoneNumber: "+2348000000000",
            email: "test@tallypadi.com",
            password: "Password123!",
            businessName: "Test Shop"
        }
    } as any;

    const res = {
        status: (code: number) => ({
            json: (data: any) => console.log("STATUS", code, data)
        }),
        json: (data: any) => console.log("JSON", data)
    } as any;

    try {
        await registerUser(req, res);
    } catch (e) {
        console.error("CATCH block intercepted:", e);
    }
    
    process.exit(0);
}
run();
