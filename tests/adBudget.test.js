const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeProviders,
  toMajorUnits,
  toMinorUnits,
} = require('../dist/services/Campaign/adBudget.service');

test('normalizes legacy ad provider names and removes duplicates', () => {
  assert.deepEqual(normalizeProviders(['META', 'META_ADS', 'TIKTOK']), ['META_ADS', 'TIKTOK_ADS']);
});

test('expands ALL to every supported ad provider', () => {
  assert.deepEqual(normalizeProviders('ALL'), [
    'META_ADS',
    'TIKTOK_ADS',
    'GOOGLE_ADS',
    'TALLYPADI_MARKETPLACE_BOOST',
  ]);
});

test('converts budget amounts between major and minor units', () => {
  assert.equal(toMinorUnits(50000), 5000000);
  assert.equal(toMajorUnits(5000000), 50000);
});
