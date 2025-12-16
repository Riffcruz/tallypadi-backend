import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Connect to Redis using environment variable or default fallback
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

// ============================================================
// QUEUE 1: OUTBOUND NOTIFICATIONS (Daily Summaries / User Responses)
// This queue is rate-limited in worker.ts to prevent Meta/WhatsApp throttling.
// ============================================================
export const notificationQueue = new Queue('daily-summary', { 
    connection,
    defaultJobOptions: {
        // Options match the worker's expected defaults
        attempts: 3, 
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true, 
        removeOnFail: 1000, 
    }
});

/**
 * Helper to queue an outbound WhatsApp message. This uses the rate-limited notification queue.
 * This should be called instead of sendWhatsAppText directly inside the controller logic.
 * @param phoneNumber The recipient's phone number (with country code).
 * @param message The text message content.
 */
export const queueOutboundMessage = async (phoneNumber: string, message: string) => {
    await notificationQueue.add('send-text', { 
        phoneNumber, 
        message 
    }, { 
        // Use the phone number and a timestamp as the job ID for unique tracking
        jobId: `outbound:${phoneNumber}:${Date.now()}`
    });
};


// ============================================================
// QUEUE 2: INCOMING MESSAGES
// This queue is used by the webhook receiver to quickly add jobs.
// Its workers are defined in worker.ts.
// ============================================================
export const messageQueue = new Queue('incoming-messages', { 
    connection,
    defaultJobOptions: {
        // High retry count for sales data persistence (1000 attempts)
        attempts: 1000, 
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true, 
        removeOnFail: 500, 
    }
});