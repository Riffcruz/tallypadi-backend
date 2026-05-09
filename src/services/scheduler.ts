// src/services/scheduler.service.ts
import cron from 'node-cron';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { Debtor } from '../models/debtor.model';
import { Inventory } from '../models/inventory.model';
import { queueOutboundMessage } from './queue.service';
import { cleanupPdfReports } from './pdf.service';
import { orderService } from './order.service';
import { runAdBoostMaintenance } from './adCampaign.service';

const BATCH_SIZE = 2000;
const SPREAD_MINUTES = 10; // spread sending load (0..9 min) per user deterministically

// ✅ Currency + Locale fallbacks (same idea as your PDF/receipts)
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

const COUNTRY_LOCALE: Record<string, string> = {
  NG: 'en-NG',
  GH: 'en-GH',
  US: 'en-US',
  GB: 'en-GB',
  EU: 'en-IE',
  KE: 'en-KE',
  ZA: 'en-ZA',
  IN: 'en-IN',
  CA: 'en-CA',
  AU: 'en-AU',
  JP: 'ja-JP',
  AE: 'en-AE',
  RW: 'en-RW',
  TZ: 'en-TZ',
  UG: 'en-UG',
};

// ✅ Cache Intl formatters (fast for big batches)
const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

function resolveUserCountryCode(u: any): string {
  return String(u?.countryCode || u?.profile?.countryCode || 'NG').toUpperCase();
}

function resolveCurrencyAndLocale(u: any) {
  const cc = resolveUserCountryCode(u);

  const currencyCode = String(
    u?.currencyCode ||
      u?.settings?.currencyCode ||
      COUNTRY_CURRENCY_CODE[cc] ||
      'NGN'
  ).toUpperCase();

  const locale = String(
    u?.locale ||
      u?.settings?.locale ||
      COUNTRY_LOCALE[cc] ||
      'en-NG'
  );

  return { currencyCode, locale };
}

function formatMoney(amount: any, locale: string, currencyCode: string) {
  const safe = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const key = `${locale}|${currencyCode}`;

  try {
    let fmt = moneyFormatterCache.get(key);
    if (!fmt) {
      fmt = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'symbol', // ✅ WhatsApp-friendly (₦, $, £, etc)
        maximumFractionDigits: 0,
      });
      moneyFormatterCache.set(key, fmt);
    }
    return fmt.format(safe);
  } catch {
    // fallback if Intl blows up for any reason
    return `${currencyCode} ${safe.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
  }
}

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
      // ✅ fetch only due users (fast, indexed)
      // ✅ include currency fields so we can format per-user correctly
      const dueUsers = await User.find({
        'settings.dailySummaryEnabled': true,
        nextSummaryAt: { $ne: null, $lte: now },
      })
        .select(
          [
            '_id',
            'phoneNumber',
            'settings.closingTime',
            'settings.utcOffsetMinutes',
            'lastSummaryDateKey',
            'currencyCode',
            'locale',
            'countryCode',
            'profile.countryCode',
            'settings.currencyCode',
            'settings.locale',
          ].join(' ')
        )
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

        // ✅ per-user currency formatting
        const { currencyCode, locale } = resolveCurrencyAndLocale(u);
        const totalFormatted = formatMoney(total, locale, currencyCode);

        if (u.lastSummaryDateKey !== dateKey && total > 0) {
          const message =
            `🏁 *Closing Time!*\n\n` +
            `Today you made *${totalFormatted}*.\n\n` +
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
            subscriptionStatus: { $in: ['trial'] },
            trialEndsAt: { $lte: threeDaysFromNow, $gte: twoDaysFromNow },
          },
        ],
      })
        .select('phoneNumber subscriptionStatus nextBillingDate trialEndsAt')
        .lean();

      for (const u of expiringUsers) {
        const msg =
          u.subscriptionStatus === 'trial'
            ? `⏳ Your Tallypadi trial will expire in 3 days on ${new Date(u.trialEndsAt as any).toDateString()}. Subscribe to continue.`
            : `⏳ Your Tallypadi subscription renews in 3 days on ${new Date(u.nextBillingDate as any).toDateString()}. Renew to avoid interruption.`;

        await queueOutboundMessage(u.phoneNumber, msg);
      }
    } catch (err) {
      console.error('❌ Expiring plan scheduler error:', err);
    }
  });

  // 3) PDF cleanup (runs EVERY HOUR to catch expired files faster)
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('⏰ Cleaning up old PDF reports...');
      await cleanupPdfReports();
    } catch (err) {
      console.error('❌ PDF cleanup error:', err);
    }
  });

  // 4) Order Reminders (Daily 8 AM)
  cron.schedule('0 8 * * *', async () => {
    try {
        const orders = await orderService.getOrdersDueForReminder(3);
        console.log(`Checking order reminders. Found ${orders.length} due in 3 days.`);
        
        for (const order of orders) {
             const user = order.user as any;
             if (!user || !user.phoneNumber) continue;
             
             const dDate = new Date(order.deliveryDate).toDateString();
             const msg = `🔔 *Order Reminder*\n\nOrder for *${order.customerName}* (${order.description}) is due on *${dDate}* (in 3 days).\n\nStatus: ${order.status}`;
             
             await queueOutboundMessage(user.phoneNumber, msg);
             
             order.reminderSent = true;
             await order.save();
        }
    } catch (err) {
        console.error('❌ Order reminder scheduler error:', err);
    }
  });

  // 5) Auto-expire subscriptions (Every 10 minutes)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await runAdBoostMaintenance();
      const changed = result.completedCount + result.campaignMetadataPurged + result.productBoostsRemoved;
      if (changed > 0) {
        console.log(
          `📣 Ads maintenance: completed ${result.completedCount}, purged SEO metadata from ${result.campaignMetadataPurged} campaign(s), removed expired boosts from ${result.productBoostsRemoved} product(s).`
        );
      }
    } catch (err) {
      console.error('❌ Ads boost maintenance scheduler error:', err);
    }
  });

  // 6) Auto-expire subscriptions (Every 10 minutes)
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Expire Trials
      const trialResult = await User.updateMany(
        {
          subscriptionStatus: 'trial',
          $or: [
            // Case 1: trialEndsAt is set and is in the past
            { trialEndsAt: { $lt: now } },
            // Case 2: trialEndsAt is NOT set (null/undefined), and user was created more than 7 days ago
            { trialEndsAt: null, createdAt: { $lt: sevenDaysAgo } },
            { trialEndsAt: { $exists: false }, createdAt: { $lt: sevenDaysAgo } },
          ],
        },
        {
          $set: { subscriptionStatus: 'past_due' },
        }
      );

      if (trialResult.modifiedCount > 0) {
        console.log(`📉 Expired ${trialResult.modifiedCount} trial users.`);
      }

      // Expire Active Plans
      const activeResult = await User.updateMany(
        {
          subscriptionStatus: 'active',
          nextBillingDate: { $lt: now },
        },
        {
          $set: { subscriptionStatus: 'past_due' },
        }
      );

      if (activeResult.modifiedCount > 0) {
        console.log(`📉 Expired ${activeResult.modifiedCount} active users.`);
      }
    } catch (err) {
      console.error('❌ Auto-expire scheduler error:', err);
    }
  });

  // 7) 💰 Debt Due-Date Reminders (Daily at 9 AM UTC)
  //    - Finds debtors whose dueDate is TODAY and haven't been reminded yet
  //    - WhatsApps the DEBTOR directly if their phone is recorded
  //    - WhatsApps the OWNER if debtor has no phone
  cron.schedule('0 9 * * *', async () => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const dueTodayDebtors = await Debtor.find({
        dueDate: { $gte: todayStart, $lte: todayEnd },
        dueDateReminderSent: { $ne: true },
        totalDebt: { $gt: 0 },
      }).populate('user', 'phoneNumber businessName currencyCode locale countryCode').lean();

      if (!dueTodayDebtors.length) return;
      console.log(`🔔 Debt reminder: ${dueTodayDebtors.length} debtors due today`);

      const bulkOps: any[] = [];

      for (const debtor of dueTodayDebtors) {
        const owner = debtor.user as any;
        if (!owner?.phoneNumber) continue;

        const { currencyCode, locale } = resolveCurrencyAndLocale(owner);
        const amount = formatMoney(debtor.totalDebt, locale, currencyCode);
        const shopName = owner.businessName || 'your supplier';

        if (debtor.phone) {
          // ── Message TO the debtor ──
          const debtorMsg =
            `👋 Hi *${debtor.displayName}*,\n\n` +
            `This is a friendly reminder from *${shopName}* that your balance of *${amount}* is due today.\n\n` +
            `Please make payment as soon as possible. Thank you! 🙏`;

          await queueOutboundMessage(debtor.phone, debtorMsg);
        } else {
          // ── Message TO the owner if debtor has no phone ──
          const ownerMsg =
            `💰 *Debt Due Today*\n\n` +
            `*${debtor.displayName}* owes you *${amount}* and their due date is today.\n\n` +
            `No phone number saved for them — contact them manually or update their number in the Debtors page.`;

          await queueOutboundMessage(owner.phoneNumber, ownerMsg);
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: debtor._id },
            update: { $set: { dueDateReminderSent: true } },
          },
        });
      }

      if (bulkOps.length) await Debtor.bulkWrite(bulkOps, { ordered: false });
    } catch (err) {
      console.error('❌ Debt reminder scheduler error:', err);
    }
  });

  // 8) 📦 Low Stock Restock Alerts (Daily at 7 AM UTC)
  //    - Finds items where quantity <= lowStockThreshold
  //    - WhatsApps the OWNER with a pre-formatted supplier message
  //    - Groups all low-stock items per owner in ONE message (not per item)
  cron.schedule('0 7 * * *', async () => {
    try {
      const lowStockItems = await Inventory.find({
        lowStockThreshold: { $ne: null, $gt: 0 },
        isDeleted: { $ne: true },
        $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
      }).populate('user', 'phoneNumber businessName currencyCode locale countryCode settings').lean();

      if (!lowStockItems.length) return;
      console.log(`📦 Restock alert: ${lowStockItems.length} low-stock items across all shops`);

      // Group items by owner
      const byOwner = new Map<string, { owner: any; items: any[] }>();
      for (const item of lowStockItems) {
        const owner = item.user as any;
        if (!owner?.phoneNumber) continue;
        const key = String(owner._id);
        if (!byOwner.has(key)) byOwner.set(key, { owner, items: [] });
        byOwner.get(key)!.items.push(item);
      }

      for (const [, { owner, items }] of byOwner.entries()) {
        // Build item list
        const itemLines = items.map((item) =>
          `• *${item.name}* — ${item.quantity} left (threshold: ${item.lowStockThreshold})` +
          (item.supplierName ? ` | Supplier: ${item.supplierName}` : '')
        ).join('\n');

        // Pre-format a supplier order message (one tap from the owner to forward)
        const orderLines = items.map((item) =>
          `- ${item.name}: please restock (currently ${item.quantity} units left)`
        ).join('\n');

        const supplierMsg = `Hi, I need to restock the following items:\n\n${orderLines}\n\nPlease advise on availability. Thank you.`
          .replace(/\n/g, '%0A')
          .replace(/ /g, '%20');

        // Pick the first item's supplier phone for the deep link (if any)
        const firstWithPhone = items.find((i) => i.supplierPhone);
        const supplierLink = firstWithPhone
          ? `\n\n📲 *Tap to order from supplier:*\nhttps://wa.me/${firstWithPhone.supplierPhone}?text=${supplierMsg}`
          : `\n\n💡 Tip: Save your supplier's number on the Products page to get a one-tap order link next time.`;

        const msg =
          `📦 *Low Stock Alert — ${items.length} item${items.length > 1 ? 's' : ''} need restocking*\n\n` +
          `${itemLines}\n` +
          supplierLink;

        await queueOutboundMessage(owner.phoneNumber, msg);
      }
    } catch (err) {
      console.error('❌ Restock alert scheduler error:', err);
    }
  });

  console.log('✅ Scheduler initialized');
}
