const assert = require('node:assert/strict');
const test = require('node:test');
const { Types } = require('mongoose');
const { StockTransfer } = require('../dist/models/stockTransfer.model');
const hqRouter = require('../dist/routes/hq.routes').default;

const validTransfer = () => ({
  hq: new Types.ObjectId(),
  reference: 'TRF-TEST-001',
  fromLocation: new Types.ObjectId(),
  toLocation: new Types.ObjectId(),
  item: new Types.ObjectId(),
  itemName: 'Rice 50kg',
  quantity: 2,
  status: 'REQUESTED',
  requestedBy: new Types.ObjectId(),
  events: [{ action: 'REQUESTED', actor: new Types.ObjectId(), at: new Date() }],
});

test('stock transfer requires a positive whole-unit quantity', () => {
  const transfer = new StockTransfer({ ...validTransfer(), quantity: 0 });
  const error = transfer.validateSync();
  assert.match(error.errors.quantity.message, /minimum allowed value/);

  const decimalTransfer = new StockTransfer({ ...validTransfer(), quantity: 1.5 });
  const decimalError = decimalTransfer.validateSync();
  assert.match(decimalError.errors.quantity.message, /whole number/);
});

test('stock transfer rejects unknown workflow states', () => {
  const transfer = new StockTransfer({ ...validTransfer(), status: 'MISSING' });
  const error = transfer.validateSync();
  assert.match(error.errors.status.message, /not a valid enum value/);
});

test('stock hub exposes stock, request, workflow, and receiving routes', () => {
  const routes = hqRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

  assert.ok(routes.includes('GET /stock'));
  assert.ok(routes.includes('GET /transfers'));
  assert.ok(routes.includes('POST /transfers'));
  assert.ok(routes.includes('PATCH /transfers/:id'));
  assert.ok(routes.includes('POST /stock/receive'));
});
