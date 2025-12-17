import cron from 'node-cron';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { queueOutboundMessage } from './queue.service';
import { cleanupPdfReports } from './pdf.service';

const BATCH_SIZE = 2000;
const SPREAD_MINUTES = 10; // spread sending load (0..9 min) per user deterministically

function parseClosingTime(s?: string) {
  const raw = String(s || '20:00');
  const [hh, mm] = raw.split(':').map((x) => Number(x));
  const hour = Number.isFinite(hh) ? hh : 20;
  const minute = Number.isFinite(mm) ? mm : 0;
  return { hour: Math.min(Math.max(hour, 0), 23), minute: Math.min(Math.max(minute, 0), 59) };
}

function stableJitterMinutes(id: any, spread: number) {
  const s = String(id || '');
  const last2 = s.slice(-2);
  const n = parseInt(last2, 16);
  if (!Number.isFinite(n) || spread <= 0) return 0;
  return n % spread;
}

export const getDateKeyForOffset = (d: Date, offsetMin: number) => {
  const shifted = new Date(d.getTime() + offsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// compute next closing-time moment in UTC (with deterministic jitter)
function computeNextSummaryAtUTC(now: Date, offsetMin: number, closingTime: string, userId: any) {
  const { hour, minute } = parseClosingTime(closingTime);

  // local "view" of now
  const localNow = new Date(now.getTime() + offsetMin * 60_000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();

  // local target (closing time) expressed in UTC-fields, then convert back to UTC by subtracting offset
  let targetUtcMs = Date.UTC(y, m, d, hour, minute, 0, 0) - offsetMin * 60_000;

  // if already passed, schedule for next local day
  if (targetUtcMs <= now.getTime()) {
    targetUtcMs += 24 * 60 * 60 * 1000;
  }

  const jitter = stableJitterMinutes(userId, SPREAD_MINUTES);
  targetUtcMs += jitter * 60_000;

  return new Date(targetUtcMs);
}

export function startScheduler() {
  // 1) Closing-time summary checker (every minute)
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    try {
      // fetch only due users (fast, indexed)
      const dueUsers = await User.find({
        'settings.dailySummaryEnabled': true,
        nextSummaryAt: { $ne: null, $lte: now },
      })
        .select('_id phoneNumber settings.closingTime settings.utcOffsetMinutes lastSummaryDateKey')
        .limit(BATCH_SIZE)
        .lean();

      if (!dueUsers.length) return;

      // group users by their local dateKey (so date query is correct)
      const groups = new Map<string, { ids: any[]; users: any[] }>();

      for (const u of dueUsers) {
        const offset = Number(u.settings?.utcOffsetMinutes ?? 60);
        const dateKey = getDateKeyForOffset(now, offset);

        // avoid duplicates (if cron runs again before update)
        if (u.lastSummaryDateKey === dateKey) continue;

        const g = groups.get(dateKey) || { ids: [], users: [] };
        g.ids.push(u._id);
        g.users.push(u);
        groups.set(dateKey, g);
      }

      // totals map: userId -> total
      const totals = new Map<string, number>();

      for (const [dateKey, g] of groups.entries()) {
        const agg = await Transaction.aggregate([
          {
            $match: {
              user: { $in: g.ids },
              type: 'SALE',
              date: dateKey,
              isUndone: { $ne: true },
            },
          },
          { $group: { _id: '$user', total: { $sum: '$totalMoney' } } },
        ]);

        for (const row of agg) {
          totals.set(String(row._id), Number(row.total || 0));
        }
      }

      // queue messages + update nextSummaryAt in bulk
      const bulkOps: any[] = [];

      for (const u of dueUsers) {
        const offset = Number(u.settings?.utcOffsetMinutes ?? 60);
        const closingTime = String(u.settings?.closingTime || '20:00');
        const dateKey = getDateKeyForOffset(now, offset);

        // set next run immediately to prevent re-queuing duplicates
        const nextAt = computeNextSummaryAtUTC(now, offset, closingTime, u._id);

        const total = totals.get(String(u._id)) || 0;

        if (u.lastSummaryDateKey !== dateKey && total > 0) {
          const message =
            `🏁 *Closing Time!*\n\n` +
            `Today you made *₦${total.toLocaleString()}*.\n\n` +
            `Reply *close book* to generate full summary.`;

          await queueOutboundMessage(u.phoneNumber, message);
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: u._id },
            update: { $set: { nextSummaryAt: nextAt, lastSummaryDateKey: dateKey } },
          },
        });
      }

      if (bulkOps.length) await User.bulkWrite(bulkOps, { ordered: false });
    } catch (err) {
      console.error('❌ Scheduler error:', err);
    }
  });

  // 2) Expiring plan reminders (daily 9am server time)
  cron.schedule('0 9 * * *', async () => {
    try {
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
      })
        .select('phoneNumber subscriptionStatus nextBillingDate trialEndsAt')
        .lean();

      for (const u of expiringUsers) {
        const msg =
          u.subscriptionStatus === 'trial'
            ? `⏳ Your Tallypadi trial will expire in 3 days on ${new Date(u.trialEndsAt).toDateString()}. Subscribe to continue.`
            : `⏳ Your Tallypadi subscription renews in 3 days on ${new Date(u.nextBillingDate as any).toDateString()}. Renew to avoid interruption.`;

        await queueOutboundMessage(u.phoneNumber, msg);
      }
    } catch (err) {
      console.error('❌ Expiring plan scheduler error:', err);
    }
  });

  // 3) PDF cleanup (daily 2am)
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('⏰ Cleaning up old PDF reports...');
      await cleanupPdfReports();
    } catch (err) {
      console.error('❌ PDF cleanup error:', err);
    }
  });

  console.log('✅ Scheduler initialized');
}
