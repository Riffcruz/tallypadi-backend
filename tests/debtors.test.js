const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateDebtorTotalFromHistory,
  getDebtors,
} = require('../dist/controllers/debtor.controller');
const {
  getReceiptPaymentSummary,
  buildReceiptContactLines,
} = require('../dist/controllers/receipt.controller');
const { applyPaymentToDebts } = require('../dist/services/debt.service');
const { Debtor } = require('../dist/models/debtor.model');
const { Transaction } = require('../dist/models/transaction.model');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('debtor total uses remaining balance for partial credit sales', () => {
  const history = [
    {
      type: 'SALE',
      paymentStatus: 'PARTIAL',
      totalMoney: 100_000,
      amountPaid: 80_000,
      balance: 20_000,
    },
    {
      type: 'PAYMENT_RECEIVED',
      totalMoney: 80_000,
      amountPaid: 80_000,
    },
  ];

  assert.equal(calculateDebtorTotalFromHistory(history), 20_000);
});

test('getDebtors returns current outstanding balance for partial credit sale', async () => {
  const originalAggregate = Debtor.aggregate;

  Debtor.aggregate = async () => [
    {
      _id: 'debtor-1',
      displayName: 'Davidson Collection',
      updatedAt: new Date('2026-06-03T14:00:00Z'),
      totalDebt: 100_000,
      history: [
        {
          type: 'SALE',
          paymentStatus: 'PARTIAL',
          totalMoney: 100_000,
          amountPaid: 80_000,
          balance: 20_000,
          items: [{ name: 'five pairs adidas sneaker' }],
        },
      ],
    },
  ];

  const res = createRes();

  try {
    await getDebtors({ user: { id: '507f1f77bcf86cd799439011' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].totalDebt, 20_000);
    assert.equal(res.body[0].lastProductStr, 'five pairs adidas sneaker');
    assert.equal(Object.hasOwn(res.body[0], 'history'), false);
  } finally {
    Debtor.aggregate = originalAggregate;
  }
});

test('applyPaymentToDebts reduces partial debts and clears fully paid sale', async () => {
  const originalFind = Transaction.find;
  let capturedQuery = null;
  let saved = false;
  const tx = {
    amountPaid: 80_000,
    balance: 20_000,
    paymentStatus: 'PARTIAL',
    settledAt: null,
    async save() {
      saved = true;
    },
  };

  Transaction.find = (query) => {
    capturedQuery = query;
    return {
      sort: async () => [tx],
    };
  };

  try {
    const result = await applyPaymentToDebts('shop-1', 'debtor-1', 20_000);

    assert.deepEqual(capturedQuery.paymentStatus, { $in: ['CREDIT', 'PARTIAL'] });
    assert.equal(result.applied, 20_000);
    assert.equal(result.remaining, 0);
    assert.equal(result.clearedCount, 1);
    assert.equal(tx.amountPaid, 100_000);
    assert.equal(tx.balance, 0);
    assert.equal(tx.paymentStatus, 'PAID');
    assert.equal(tx.settledAt instanceof Date, true);
    assert.equal(saved, true);
  } finally {
    Transaction.find = originalFind;
  }
});

test('applyPaymentToDebts marks credit sale partial when payment is not enough', async () => {
  const originalFind = Transaction.find;
  const tx = {
    amountPaid: 0,
    balance: 50_000,
    paymentStatus: 'CREDIT',
    settledAt: null,
    async save() {},
  };

  Transaction.find = () => ({
    sort: async () => [tx],
  });

  try {
    const result = await applyPaymentToDebts('shop-1', 'debtor-1', 20_000);

    assert.equal(result.applied, 20_000);
    assert.equal(result.clearedCount, 0);
    assert.equal(tx.amountPaid, 20_000);
    assert.equal(tx.balance, 30_000);
    assert.equal(tx.paymentStatus, 'PARTIAL');
    assert.equal(tx.settledAt, null);
  } finally {
    Transaction.find = originalFind;
  }
});

test('receipt payment summary exposes total paid and outstanding balance', () => {
  assert.deepEqual(
    getReceiptPaymentSummary({
      paymentStatus: 'PARTIAL',
      totalMoney: 100_000,
      amountPaid: 80_000,
      balance: 20_000,
    }),
    { total: 100_000, discount: 0, paid: 80_000, outstanding: 20_000 }
  );

  assert.deepEqual(
    getReceiptPaymentSummary({
      paymentStatus: 'CREDIT',
      totalMoney: 100_000,
      amountPaid: 0,
      balance: 100_000,
    }),
    { total: 100_000, discount: 0, paid: 0, outstanding: 100_000 }
  );

  assert.deepEqual(
    getReceiptPaymentSummary({
      paymentStatus: 'PAID',
      totalMoney: 100_000,
      amountPaid: 100_000,
      balance: 0,
    }),
    { total: 100_000, discount: 0, paid: 100_000, outstanding: 0 }
  );
});

test('receipt contact lines include phone and configured address only when set', () => {
  assert.deepEqual(
    buildReceiptContactLines({
      phoneNumber: '2348012345678',
      settings: {
        location: {
          address: '12 Market Road',
          city: 'Ikeja',
          state: 'Lagos',
          country: 'NG',
        },
      },
    }),
    ['Phone/WhatsApp: 2348012345678', 'Address: 12 Market Road, Ikeja, Lagos, NG']
  );

  assert.deepEqual(buildReceiptContactLines({ settings: { location: {} } }), []);
});
