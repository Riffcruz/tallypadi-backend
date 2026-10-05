const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSalePayloadHash,
  normalizeClientSaleId,
  parseClientRecordedAt,
} = require('../dist/services/salesIdempotency.service');
const { Transaction } = require('../dist/models/transaction.model');
const { Inventory } = require('../dist/models/inventory.model');

test('sale payload hash is stable when object key order changes', () => {
  const first = buildSalePayloadHash({
    paymentMethod: 'CASH',
    items: [{ itemId: 'item-1', quantity: 2, price: 400 }],
    discountAmount: 0,
  });
  const second = buildSalePayloadHash({
    discountAmount: 0,
    items: [{ price: 400, quantity: 2, itemId: 'item-1' }],
    paymentMethod: 'CASH',
  });

  assert.equal(first, second);
});

test('client sale IDs accept UUIDs and reject unsafe values', () => {
  assert.equal(
    normalizeClientSaleId('8ab10e31-0a85-4497-bdb3-2ba92fcd70cd'),
    '8ab10e31-0a85-4497-bdb3-2ba92fcd70cd'
  );
  assert.throws(() => normalizeClientSaleId('../duplicate-sale'), /Invalid client sale ID/);
});

test('offline sale timestamp rejects impossible future times', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  assert.throws(() => parseClientRecordedAt(future), /future/);
});

test('transaction schema enforces one client sale ID per user', () => {
  const indexes = Transaction.schema.indexes();
  const index = indexes.find(([fields]) => fields.user === 1 && fields.clientSaleId === 1);
  assert.ok(index);
  assert.equal(index[1].unique, true);
});

test('inventory sale sync markers are never selected by default', () => {
  const path = Inventory.schema.path('saleSyncKeys');
  assert.ok(path);
  assert.equal(path.options.select, false);
});
