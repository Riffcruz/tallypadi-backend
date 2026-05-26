const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateReferralRewardMinor,
  canApplyReferral,
  normalizeReferralCode,
} = require('../dist/services/referral.service');

test('normalizes referral codes for URL and form input', () => {
  assert.equal(normalizeReferralCode(' ab-c_123 '), 'ABC123');
  assert.equal(normalizeReferralCode('bad'), null);
});

test('calculates referral reward as admin percentage of qualifying funding', () => {
  const result = calculateReferralRewardMinor({
    enabled: true,
    fundingAmountMinor: 1_500_000,
    minimumFundingAmountMinor: 1_000_000,
    rewardPercentage: 10,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.rewardAmountMinor, 150_000);
});

test('does not reward below the configured minimum funding amount', () => {
  const result = calculateReferralRewardMinor({
    enabled: true,
    fundingAmountMinor: 900_000,
    minimumFundingAmountMinor: 1_000_000,
    rewardPercentage: 10,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'BELOW_MINIMUM');
  assert.equal(result.rewardAmountMinor, 0);
});

test('does not reward when already rewarded or disabled', () => {
  assert.equal(calculateReferralRewardMinor({
    enabled: true,
    fundingAmountMinor: 2_000_000,
    minimumFundingAmountMinor: 1_000_000,
    rewardPercentage: 10,
    alreadyRewarded: true,
  }).reason, 'ALREADY_REWARDED');

  assert.equal(calculateReferralRewardMinor({
    enabled: false,
    fundingAmountMinor: 2_000_000,
    minimumFundingAmountMinor: 1_000_000,
    rewardPercentage: 10,
  }).reason, 'DISABLED');
});

test('rejects invalid referral relationships', () => {
  assert.equal(canApplyReferral({
    referrerId: 'user-1',
    referredUserId: 'user-1',
    referrerRole: 'OWNER',
    referrerStatus: 'active',
  }).reason, 'SELF_REFERRAL');

  assert.equal(canApplyReferral({
    referrerId: 'user-1',
    referredUserId: 'user-2',
    referrerRole: 'STAFF',
    referrerStatus: 'active',
  }).reason, 'REFERRER_NOT_OWNER');

  assert.equal(canApplyReferral({
    referrerId: 'user-1',
    referredUserId: 'user-2',
    referrerRole: 'OWNER',
    referrerStatus: 'suspended',
  }).reason, 'REFERRER_SUSPENDED');

  assert.equal(canApplyReferral({
    referrerId: 'user-1',
    referredUserId: 'user-2',
    referrerRole: 'OWNER',
    referrerStatus: 'active',
    existingReferredBy: 'user-3',
  }).reason, 'ALREADY_REFERRED');
});
