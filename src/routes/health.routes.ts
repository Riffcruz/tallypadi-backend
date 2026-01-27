import { Router, Request, Response } from 'express';
import { messageQueue, replyQueue, bulkQueue } from '../services/queue.service';

const router = Router();

// GET /api/health/queue
router.get('/queue', async (req: Request, res: Response) => {
  try {
    const [
      msgWaiting, msgActive, msgFailed, msgCompleted,
      replyWaiting, replyActive, replyFailed,
      bulkWaiting, bulkActive, bulkFailed
    ] = await Promise.all([
      messageQueue.getWaitingCount(),
      messageQueue.getActiveCount(),
      messageQueue.getFailedCount(),
      messageQueue.getCompletedCount(),

      replyQueue.getWaitingCount(),
      replyQueue.getActiveCount(),
      replyQueue.getFailedCount(),

      bulkQueue.getWaitingCount(),
      bulkQueue.getActiveCount(),
      bulkQueue.getFailedCount(),
    ]);

    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      incoming_messages: {
        waiting: msgWaiting,
        active: msgActive,
        failed: msgFailed,
        completed: msgCompleted,
      },
      outbound_replies: {
        waiting: replyWaiting,
        active: replyActive,
        failed: replyFailed,
      },
      outbound_bulk: {
        waiting: bulkWaiting,
        active: bulkActive,
        failed: bulkFailed,
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error?.message || 'Unknown error' });
  }
});

// POST /api/health/retry
router.post('/retry', async (req: Request, res: Response) => {
  try {
    await Promise.all([
      messageQueue.retryJobs({ count: 200 }),
      replyQueue.retryJobs({ count: 200 }),
      bulkQueue.retryJobs({ count: 200 }),
    ]);

    res.json({ message: 'Retrying failed jobs...' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error?.message || 'Unknown error' });
  }
});

export default router;
