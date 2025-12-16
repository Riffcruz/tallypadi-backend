import { Router } from 'express';
import { messageQueue, notificationQueue } from '../services/queue.service';

const router = Router();

// GET /api/health/queue
// Check how many messages are waiting vs processed
router.get('/queue', async (req, res) => {
    try {
        const [msgWaiting, msgActive, msgFailed, msgCompleted] = await Promise.all([
            messageQueue.getWaitingCount(),
            messageQueue.getActiveCount(),
            messageQueue.getFailedCount(),
            messageQueue.getCompletedCount()
        ]);

        const [notifWaiting, notifActive, notifFailed] = await Promise.all([
            notificationQueue.getWaitingCount(),
            notificationQueue.getActiveCount(),
            notificationQueue.getFailedCount()
        ]);

        res.json({
            status: 'online',
            timestamp: new Date(),
            incoming_messages: {
                waiting: msgWaiting,
                active: msgActive,
                failed: msgFailed,
                completed: msgCompleted
            },
            outbound_notifications: {
                waiting: notifWaiting,
                active: notifActive,
                failed: notifFailed
            }
        });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// GET /api/health/retry
// Force retry of failed jobs (Emergency Button)
router.post('/retry', async (req, res) => {
    try {
        await messageQueue.retryJobs({ count: 100 });
        await notificationQueue.retryJobs({ count: 100 });
        res.json({ message: "Retrying failed jobs..." });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;