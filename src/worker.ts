import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendWhatsAppText } from './services/whatsapp.service';

// Connect to Redis
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    // Ensure connection is resilient
    maxRetriesPerRequest: null,
});

// ============================================================
// QUEUE 1: DAILY SUMMARIES (Outbound - Rate Limited)
// ============================================================
export const notificationQueue = new Queue('daily-summary', { 
    connection,
    defaultJobOptions: {
        // Retry a failing notification up to 3 times
        attempts: 3, 
        // Use exponential backoff to space out retries
        backoff: { type: 'exponential', delay: 5000 },
        // Clean up successful jobs automatically
        removeOnComplete: true, 
        // Keep the last 1000 failed jobs for inspection
        removeOnFail: 1000, 
    }
});

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

// 🟢 ADDED: Lively logging events for visibility
summaryWorker.on('active', job => console.log(`🚀 Summary active: Sending to ${job.data.phoneNumber}`)); 
summaryWorker.on('completed', job => console.log(`✅ Summary sent to ${job.data.phoneNumber}`));
// FIX: Using safe access for attemptsMade
summaryWorker.on('failed', (job, err) => console.error(`❌ Summary failed [Attempt ${job?.attemptsMade || 'N/A'}]: ${err.message}`));
summaryWorker.on('stalled', jobid => console.warn(`⚠️ Summary job ${jobid} stalled. Check network connection.`));


// ============================================================
// QUEUE 2: INCOMING MESSAGES (Inbound - High Speed)
// ============================================================
export const messageQueue = new Queue('incoming-messages', { 
    connection,
    defaultJobOptions: {
        // Retry message processing persistently to ensure no data is lost
        attempts: 1000, 
        // Use exponential backoff for persistent, non-hammering retries
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true, 
        removeOnFail: 500, // Keep last 500 failed for inspection
    }
});

const messageWorker = new Worker('incoming-messages', async (job) => {
    // Extract message data from job
    const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
    
    console.log(`⚡ Processing background job for ${from}...`);
    if (profileName) console.log(`👤 Worker found profile name: ${profileName}`);

    // Dynamic import to avoid circular dependency with the controller
    // 🟢 FIX: Corrected relative path from src/worker.ts to src/controllers/whatsapp.controller
    const { handleMessageLogic } = await import('./controllers/whatsapp.controller');
    
    await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);

}, { 
    connection,
    // High concurrency: Process 50 messages at once since we are just doing DB/AI work
    concurrency: 50,
    // Checks for stalled jobs more frequently to restart them
    stalledInterval: 10000 
});

// 🟢 ADDED: Lively logging events for visibility
messageWorker.on('active', job => console.log(`⏩ Message active: Processing incoming text from ${job.data.from}`));
messageWorker.on('completed', job => console.log(`✔️ Message processed for: ${job.data.from}`));
// FIX: Using safe access for attemptsMade
messageWorker.on('failed', (job, err) => console.error(`❌ Message processing failed [Attempt ${job?.attemptsMade || 'N/A'}]: ${err.message}`));
messageWorker.on('stalled', jobid => console.warn(`⚠️ Message job ${jobid} stalled. Check database connection.`));