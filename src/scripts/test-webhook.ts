import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// 1. Robustly Load .env from Project Root
// Using process.cwd() avoids conflicts between __dirname (missing in ESM) and import.meta (missing in CJS TS config)
const envPath = path.resolve(process.cwd(), '.env');
console.log(`📂 Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_live_5c957d56a5d4197a2db869a0501c51f7b8dfdc34';
const WEBHOOK_URL = `http://localhost:${PORT}/api/webhook/paystack`; 

if (!SECRET_KEY) {
    console.error("❌ Error: PAYSTACK_SECRET_KEY is missing in .env");
    console.log("   (Ensure you are running this script from the project root directory)");
    process.exit(1);
}

// Log loaded key (masked) to verify it's finding the correct one
const maskedKey = SECRET_KEY.substring(0, 4) + '...' + SECRET_KEY.substring(SECRET_KEY.length - 4);
console.log(`🔑 Loaded Secret Key: ${maskedKey}`);

// Generate a valid 24-char hex string to prevent Mongoose CastError
const randomValidId = crypto.randomBytes(12).toString('hex');

// 2. Mock Paystack Payload
const payload = {
    event: "charge.success",
    data: {
        id: 123456789,
        domain: "test",
        status: "success",
        reference: "ref_" + Date.now(),
        amount: 500000, 
        message: null,
        gateway_response: "Successful",
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        channel: "card",
        currency: "NGN",
        ip_address: "127.0.0.1",
        metadata: {
            // 🟢 FIX: Use a valid ID format so the server doesn't crash.
            // ⚠️ REPLACE THIS with a real User ID from your DB if you want to verify the plan update!
            userId: '693f930fc3f7419ec8089cd6', 
            planType: "OGA_BOSS" ,
            custom_fields: []
        },
        customer: {
            id: 888,
            first_name: "Test",
            last_name: "User",
            email: "test@example.com",
            customer_code: "CUS_test123",
            phone: "693f930fc3f7419ec8089cd6",
            metadata: null,
            risk_action: "default"
        },
        
        plan: {
            plan_code: "PLN_test_tycoon"
        }
    }
};

const runTest = async () => {
    try {
        console.log(`🚀 Sending Fake Webhook to: ${WEBHOOK_URL}`);
        console.log(`ℹ️  Using User ID: ${payload.data.metadata.userId} (Random/Mock)`);

        // 3. Generate Signature
        const hash = crypto
            .createHmac('sha512', SECRET_KEY)
            .update(JSON.stringify(payload))
            .digest('hex');

        // 4. Send Request
        const response = await axios.post(WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-paystack-signature': hash
            }
        });

        console.log(`✅ Server Responded: ${response.status} ${response.statusText}`);
    } catch (error: any) {
        if (error.response) {
            if (error.response.status === 404) {
                console.error(`❌ Server Error: 404 Not Found`);
                console.error(`   👉 Route '${WEBHOOK_URL}' missing.`);
            } else if (error.response.status === 400) {
                console.error(`❌ Server Error: 400 Bad Request (Signature Mismatch)`);
                console.error(`   👉 ACTION REQUIRED: Restart your main server ('npm run dev').`);
                console.error(`      The server likely hasn't loaded the new PAYSTACK_SECRET_KEY from .env yet.`);
            } else if (error.response.status === 500) {
                console.error(`❌ Server Error: 500 Internal Server Error`);
                console.error(`   👉 Check your main server terminal/logs for the specific crash reason.`);
            } else {
                console.error(`❌ Server Error: ${error.response.status} - ${error.response.data}`);
            }
        } else {
            console.error(`❌ Connection Error: Is your server running on port ${PORT}?`);
        }
    }
};

runTest();