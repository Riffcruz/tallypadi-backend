import { Worker, Job } from 'bullmq'; // 🟢 Updated to use BullMQ Worker
import { messageQueue } from './services/queue.service';
import { handleMessageLogic } from './controllers/whatsapp.controller';
import { env } from './config/env'; 

console.log("👷 Worker initialized! Waiting for messages...");

// 🟢 Define the structure of the data inside the job
interface WhatsappJobData {
  from: string;
  text: string;
  messageId: string;
  mediaId?: string;
  isVoiceMessage?: boolean;
  profileName?: string;
}

// 🟢 In BullMQ, we instantiate a Worker to process the queue
// We use the queue name from the imported messageQueue
const worker = new Worker<WhatsappJobData>(messageQueue.name, async (job: Job<WhatsappJobData>) => {
  // Check job name if you use multiple types of jobs in the same queue
  if (job.name === 'process-message') {
    const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
    
    console.log(`⚙️ Worker picking up message from ${from}`);
    
    try {
      await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);
      console.log(`✅ Worker finished processing message from ${from}`);
    } catch (error) {
      console.error(`❌ Worker failed to process message from ${from}:`, error);
      throw error; // Throwing error marks the job as failed in BullMQ
    }
  }
}, {
  // 🟢 Worker needs its own connection configuration
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
  }
});

worker.on('error', (err) => {
  console.error('❌ Worker connection error:', err);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});