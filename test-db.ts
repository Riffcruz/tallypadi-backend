import mongoose from 'mongoose';
import { AdminSettings } from './src/models/adminSettings.model';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventorybot');
    console.log("Connected to MongoDB.");
    try {
        const updatePayload = {
            smtp: {
                host: "smtp.gmail.com",
                port: 0,
                user: "hello",
                pass: "world",
                fromAddress: "test@test.com",
                secure: true
            }
        };
        const settings = await AdminSettings.findOneAndUpdate({}, { $set: updatePayload }, { new: true, upsert: true });
        console.log("Success:", settings);
    } catch (e) {
        console.error("DB Error:", e);
    }
    process.exit(0);
}
run();
