import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendWhatsAppText } from './services/whatsapp.service';
// 🟢 IMPORT: Queues are now defined and configured centrally in the service file
import { notificationQueue, messageQueue } from './services/queue.service'; 

// Connect to Redis
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

// 🔴 NOTE: notificationQueue is defined in queue.service.ts, this worker consumes it.
const summaryWorker = new Worker('daily-summary', async (job) => {
    const { phoneNumber, message } = job.data;
    
    console.log(`📤 Sending summary to ${phoneNumber}...`);
    // NOTE: This worker processes jobs added via queueOutboundMessage from the controller
    await sendWhatsAppText(phoneNumber, message);
    
}, { 
    connection,
    // Strict Rate Limiting is applied here (Worker-specific logic)
    limiter: {
        max: 80,      
        duration: 1000 
    }
});

// 🟢 ADDED: Lively logging events for visibility (using safe access for attemptsMade)
summaryWorker.on('active', job => console.log(`🚀 Summary active: Sending to ${job.data.phoneNumber}`)); 
summaryWorker.on('completed', job => console.log(`✅ Summary sent to ${job.data.phoneNumber}`));
summaryWorker.on('failed', (job, err) => console.error(`❌ Summary failed [Attempt ${job?.attemptsMade || 'N/A'}]: ${err.message}`));
summaryWorker.on('stalled', jobid => console.warn(`⚠️ Summary job ${jobid} stalled. Check network connection.`));


// 🔴 NOTE: messageQueue is defined in queue.service.ts, this worker consumes it.
const messageWorker = new Worker('incoming-messages', async (job) => {
    // Extract message data from job
    // 🟢 Ensure all expected data, including profileName, is extracted
    const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
    
    console.log(`⚡ Processing background job for ${from}...`);
    if (profileName) console.log(`👤 Worker found profile name: ${profileName}`);

    // Dynamic import to avoid circular dependency with the controller
    // 🟢 FIX: Corrected relative path (assuming src/worker.ts -> src/controllers/whatsapp.controller.ts)
    const { handleMessageLogic } = await import('./controllers/whatsapp.controller');
    
    // Pass extracted parameters to handleMessageLogic
    await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);

}, { 
    connection,
    // High concurrency for high-speed processing
    concurrency: 50,
    stalledInterval: 10000 
});

// 🟢 ADDED: Lively logging events for visibility (using safe access for attemptsMade)
messageWorker.on('active', job => console.log(`⏩ Message active: Processing incoming text from ${job.data.from}`));
messageWorker.on('completed', job => console.log(`✔️ Message processed for: ${job.data.from}`));
messageWorker.on('failed', (job, err) => console.error(`❌ Message processing failed [Attempt ${job?.attemptsMade || 'N/A'}]: ${err.message}`));
messageWorker.on('stalled', jobid => console.warn(`⚠️ Message job ${jobid} stalled. Check database connection.`));