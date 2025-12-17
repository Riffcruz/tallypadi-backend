// src/services/scheduler.ts
import cron from 'node-cron';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { getTodayRangeForOffset } from '../utils/dates';
import { bulkQueue as notificationQueue } from './queue.service'; // ✅ map old name -> bulk queue
import { cleanupPdfReports } from './pdf.service';

export function startScheduler() {
  // Run every hour at minute 0 (e.g., 8:00, 9:00, 10:00)
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('⏰ Scheduler running: Checking for closing times...');

      const now = new Date();
      const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

      const users = await User.find({
        $or: [{ dailySummaryEnabled: true }, { 'settings.dailySummaryEnabled': true }],
      });

      for (const user of users) {
        try {
          const u = user as any;

          const closingString = u.closingTime ?? u.settings?.closingTime ?? '20:00';
          const [closeHour = 20, closeMinute = 0] = closingString.split(':').map(Number) as number[];

          const offset = (u.utcOffsetMinutes ?? u.settings?.utcOffsetMinutes ?? 60) as number;

          const totalMinutes = (utcMinutes + offset + 24 * 60) % (24 * 60);
          const userLocalHour = Math.floor(totalMinutes / 60);
          const userLocalMinute = totalMinutes % 60;

          if (userLocalHour === closeHour && userLocalMinute === closeMinute) {
            const { start, end } = getTodayRangeForOffset(offset);

            const sales = await Transaction.aggregate([
              {
                $match: {
                  user: user._id,
                  type: 'SALE',
                  createdAt: { $gte: start, $lte: end },
                },
              },
              { $group: { _id: null, total: { $sum: '$totalMoney' } } },
            ]);

            const total = sales.length > 0 && sales[0]?.total ? Number(sales[0].total) : 0;

            if (total > 0) {
              const message =
                `🏁 *Closing Time!*\n\n` +
                `Today you made ₦${total.toLocaleString()}.\n\n` +
                `Should I close the book for today?`;

              await notificationQueue.add(
                'send-summary',
                { phoneNumber: user.phoneNumber, message },
                {
                  attempts: 3,
                  backoff: { type: 'exponential', delay: 2000 },
                  removeOnComplete: true,
                  removeOnFail: 200,
                }
              );

              console.log(`queued summary for ${user.phoneNumber}`);
            }
          }
        } catch (err) {
          console.error(`Error processing user ${user._id}:`, err);
        }
      }
    } catch (err) {
      console.error('❌ Scheduler error:', err);
    }
  });

  // Check for expiring plans daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('⏰ Scheduler running: Checking for expiring plans...');

      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      threeDaysFromNow.setHours(23, 59, 59, 999);

      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      twoDaysFromNow.setHours(0, 0, 0, 0);

      const expiringUsers = await User.find({
        $or: [
          {
            subscriptionStatus: { $in: ['active', 'trial'] },
            nextBillingDate: { $lte: threeDaysFromNow, $gte: twoDaysFromNow },
          },
          {
            subscriptionStatus: 'trial',
            trialEndsAt: { $lte: threeDaysFromNow, $gte: twoDaysFromNow },
          },
        ],
      });

      for (const user of expiringUsers) {
        const message =
          user.subscriptionStatus === 'trial'
            ? `Your Tallypadi trial will expire in 3 days on ${user.trialEndsAt?.toDateString()}. Please subscribe to continue enjoying our services!`
            : `Your Tallypadi subscription is due for renewal in 3 days on ${user.nextBillingDate?.toDateString()}. Renew now to avoid interruption!`;

        await notificationQueue.add(
          'send-expiration-reminder',
          { phoneNumber: user.phoneNumber, message },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 200,
          }
        );

        console.log(`Queued expiration reminder for ${user.phoneNumber}`);
      }
    } catch (err) {
      console.error('❌ Expiring plan scheduler error:', err);
    }
  });

  // Clean up old PDF reports daily at 2 AM
  cron.schedule('0 2 * * *', () => {
    console.log('⏰ Scheduler running: Cleaning up old PDF reports...');
    cleanupPdfReports();
  });

  console.log('✅ Scheduler initialized');
}
