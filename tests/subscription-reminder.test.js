const test = require('node:test');
const assert = require('node:assert/strict');
const {
  subscriptionDaysRemaining,
  shouldSendSubscriptionReminder,
} = require('../dist/services/subscriptionReminder.logic');

test('calculates subscription reminders by the user local calendar day', () => {
  const now = new Date('2026-09-28T08:00:00.000Z');
  assert.equal(subscriptionDaysRemaining(now, new Date('2026-10-01T07:00:00.000Z'), 60), 3);
  assert.equal(subscriptionDaysRemaining(now, new Date('2026-09-30T07:00:00.000Z'), 60), 2);
  assert.equal(subscriptionDaysRemaining(now, new Date('2026-09-29T07:00:00.000Z'), 60), 1);
});

test('does not send the expired notice before the exact expiry time', () => {
  const expiry = new Date('2026-09-28T18:00:00.000Z');
  assert.equal(shouldSendSubscriptionReminder(new Date('2026-09-28T08:00:00.000Z'), expiry, 60), null);
  assert.equal(shouldSendSubscriptionReminder(new Date('2026-09-28T18:00:00.000Z'), expiry, 60), 0);
});

test('ignores dates outside the reminder window', () => {
  const now = new Date('2026-09-28T08:00:00.000Z');
  assert.equal(shouldSendSubscriptionReminder(now, new Date('2026-10-03T08:00:00.000Z'), 60), null);
  assert.equal(shouldSendSubscriptionReminder(now, new Date('2026-09-27T08:00:00.000Z'), 60), null);
});
