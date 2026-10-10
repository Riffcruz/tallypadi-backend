const assert = require('node:assert/strict');
const test = require('node:test');

const { PromoRedemption } = require('../dist/models/promoRedemption.model');
const { User } = require('../dist/models/user.model');
const {
  addPromoDuration,
  buildPromoAudienceMongoFilter,
  extractPromoCodeCandidate,
  isValidPromoCodeFormat,
  normalizePromoCode,
  userMatchesPromoAudience,
} = require('../dist/services/promoCode.service');

test('normalizes promo codes and accepts safe code characters only', () => {
  assert.equal(normalizePromoCode(' “welcome-30” '), 'WELCOME-30');
  assert.equal(isValidPromoCodeFormat('WELCOME_30'), true);
  assert.equal(isValidPromoCodeFormat('bad code'), false);
  assert.equal(isValidPromoCodeFormat('abc'), false);
});

test('recognizes explicit commands and pasted standalone codes', () => {
  assert.deepEqual(extractPromoCodeCandidate('redeem welcome30'), { code: 'WELCOME30', explicit: true });
  assert.deepEqual(extractPromoCodeCandidate('WELCOME30'), { code: 'WELCOME30', explicit: false });
  assert.equal(extractPromoCodeCandidate('please use my promotional offer'), null);
});

test('adds calendar months without breaking end-of-month dates', () => {
  const result = addPromoDuration(new Date('2026-01-31T10:00:00.000Z'), 1, 'MONTHS');
  assert.equal(result.toISOString(), '2026-02-28T10:00:00.000Z');
});

test('enforces audience eligibility using live account state', () => {
  const now = new Date('2026-10-10T10:00:00.000Z');
  const base = {
    role: 'OWNER',
    registrationStage: 'COMPLETED',
    subscriptionStatus: 'past_due',
    planType: 'TYCOON',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    trialEndsAt: new Date('2026-10-09T10:00:00.000Z'),
    nextBillingDate: null,
  };

  assert.equal(userMatchesPromoAudience(base, 'ALL_USERS', now), true);
  assert.equal(userMatchesPromoAudience(base, 'RECENTLY_REGISTERED', now, 7), true);
  assert.equal(userMatchesPromoAudience(base, 'TYCOON_USERS', now), true);
  assert.equal(userMatchesPromoAudience(base, 'EXPIRED_TRIALS', now), true);
  assert.equal(userMatchesPromoAudience(base, 'ACTIVE_TRIALS', now), false);
  assert.equal(userMatchesPromoAudience({ ...base, subscriptionStatus: 'suspended' }, 'ALL_USERS', now), false);
  assert.equal(userMatchesPromoAudience({ ...base, role: 'STAFF' }, 'ALL_USERS', now), false);
});

test('audience database filter always excludes staff, incomplete registration, and suspension', () => {
  const filter = buildPromoAudienceMongoFilter('ALL_USERS', new Date('2026-10-10T10:00:00.000Z'));
  assert.deepEqual(filter.role, { $in: ['OWNER', 'HQ'] });
  assert.equal(filter.registrationStage, 'COMPLETED');
  assert.deepEqual(filter.subscriptionStatus, { $ne: 'suspended' });
});

test('database schema prevents a user from redeeming one code twice', () => {
  const userUniqueIndex = PromoRedemption.schema.indexes().find(([keys, options]) => (
    keys.promoCode === 1 && keys.user === 1 && options.unique === true
  ));
  const phoneUniqueIndex = PromoRedemption.schema.indexes().find(([keys, options]) => (
    keys.promoCode === 1 && keys.phoneNumber === 1 && options.unique === true
  ));
  assert.ok(userUniqueIndex);
  assert.ok(phoneUniqueIndex);
  assert.ok(User.schema.path('redeemedPromoCodes'));
});
