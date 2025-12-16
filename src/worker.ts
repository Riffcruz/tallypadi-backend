import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendWhatsAppText } from './services/whatsapp.service';
import { notificationQueue, messageQueue } from './services/queue.service'; 

console.log("👷 Worker Script Loading..."); // 🟢 STARTUP CHECK

// Connect to Redis
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

connection.on('connect', () => console.log(`🔌 Worker connected to Redis at ${redisUrl}`));
connection.on('error', (err) => console.error('❌ Worker Redis Error:', err));

// ============================================================
// WORKER 1: OUTBOUND NOTIFICATIONS (Consumes 'daily-summary')
// ============================================================
const summaryWorker = new Worker('daily-summary', async (job) => {
    const { phoneNumber, message } = job.data;
    
    console.log(`outbound-worker processing job ${job.id}`);
    await sendWhatsAppText(phoneNumber, message);
    
}, { 
    connection,
    limiter: {
        max: 80,      
        duration: 1000 
    }
});

summaryWorker.on('active', job => console.log(`🚀 Summary active: Sending to ${job.data.phoneNumber}`)); 
summaryWorker.on('completed', job => console.log(`✅ Summary sent to ${job.data.phoneNumber}`));
summaryWorker.on('failed', (job, err) => console.error(`❌ Summary failed [Attempt ${job?.attemptsMade || 'N/A'}]: ${err.message}`));
summaryWorker.on('error', err => console.error('❌ Summary Worker Error:', err));


// ============================================================
// WORKER 2: INCOMING MESSAGES (Consumes 'incoming-messages')
// ============================================================
const messageWorker = new Worker('incoming-messages', async (job) => {
    // Extract message data
    const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
    
    console.log(`⚡ Processing background job for ${from}...`);

    try {
        // Dynamic import to avoid circular dependency
        const { handleMessageLogic } = await import('./controllers/whatsapp.controller');
        await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);
    } catch (err: any) {
        console.error("❌ Critical Error in Message Logic:", err);
        throw err; // Fail the job so it retries
    }

}, { 
    connection,
    concurrency: 50,
    stalledInterval: 10000 
});

messageWorker.on('active', job => console.log(`⏩ Message active: Processing text from ${job.data.from}`));
messageWorker.on('completed', job => console.log(`✔️ Message processed for: ${job.data.from}`));
messageWorker.on('failed', (job, err) => console.error(`❌ Message failed [Attempt ${job?.attemptsMade || 'N/A'}]: ${err.message}`));
messageWorker.on('error', err => console.error('❌ Message Worker Connection Error:', err));

console.log("✅ Workers initialized and listening...");