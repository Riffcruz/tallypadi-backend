import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendWhatsAppText } from './whatsapp.service';

// Connect to Redis
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

// ============================================================
// QUEUE 1: DAILY SUMMARIES (Outbound - Rate Limited)
// ============================================================
export const notificationQueue = new Queue('daily-summary', { connection });

const summaryWorker = new Worker('daily-summary', async (job) => {
    const { phoneNumber, message } = job.data;
    
    console.log(`📤 Sending summary to ${phoneNumber}...`);
    await sendWhatsAppText(phoneNumber, message);
    
}, { 
    connection,
    // Strict Rate Limiting to prevent WhatsApp ban
    limiter: {
        max: 80,      
        duration: 1000 
    }
});

summaryWorker.on('completed', job => console.log(`✅ Summary sent to ${job.data.phoneNumber}`));
summaryWorker.on('failed', (_job, err) => console.error(`❌ Summary failed: ${err.message}`));


// ============================================================
// QUEUE 2: INCOMING MESSAGES (Inbound - High Speed)
// ============================================================
export const messageQueue = new Queue('incoming-messages', { connection });

const messageWorker = new Worker('incoming-messages', async (job) => {
    // Extract message data from job
    // 🟢 FIX: Added 'profileName' to extraction
    const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
    
    console.log(`⚡ Processing background job for ${from}...`);
    if (profileName) console.log(`👤 Worker found profile name: ${profileName}`);

    // Dynamic import to avoid circular dependency with the controller
    const { handleMessageLogic } = await import('../controllers/whatsapp.controller');
    
    // Pass extracted parameters to handleMessageLogic
    // 🟢 FIX: Passed 'profileName' as the 6th argument
    await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);

}, { 
    connection,
    // High concurrency: Process 50 messages at once since we are just doing DB/AI work
    concurrency: 50 
});

messageWorker.on('failed', (job, err) => console.error(`❌ Message processing failed: ${err.message}`));