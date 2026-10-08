const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseStructuredDocumentRequest,
} = require('../dist/services/gemini.parsers');

const labelledDetails = `““NAME: ASWEIJA MACAULEY.R
Delivery location: Abuja, FCT.
Watch ID: SW007
Brand: Peodagar
Description: A complete gold colour stainless steel watch.
Watch type: Quartz
Amount Paid: ₦40,000
Delivery: Free
Payment status: Paid””`;

test('parses a labelled WhatsApp receipt without calling AI', () => {
  const parsed = parseStructuredDocumentRequest(`receipt for ${labelledDetails}`);

  assert.ok(parsed);
  assert.equal(parsed.intent, 'CREATE_RECEIPT');
  assert.equal(parsed.customer_name, 'ASWEIJA MACAULEY.R');
  assert.equal(parsed.total_money, 40000);
  assert.equal(parsed.amount_paid, 40000);
  assert.equal(parsed.is_credit, false);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].qty, 1);
  assert.equal(parsed.items[0].unit_price, 40000);
  assert.match(parsed.items[0].name, /peodagar quartz watch \(sw007\)/i);
  assert.match(parsed.order_params.description, /Delivery location: Abuja, FCT\./);
  assert.match(parsed.order_params.description, /Payment status: Paid/);
});

test('uses the same labelled format for invoices', () => {
  const parsed = parseStructuredDocumentRequest(`Generate invoice for ${labelledDetails}`);

  assert.ok(parsed);
  assert.equal(parsed.intent, 'CREATE_INVOICE');
  assert.equal(parsed.customer_name, 'ASWEIJA MACAULEY.R');
  assert.equal(parsed.order_params.status, 'Paid');
});

test('leaves normal conversational invoice requests for the AI parser', () => {
  assert.equal(parseStructuredDocumentRequest('invoice for John for two chairs'), null);
});
