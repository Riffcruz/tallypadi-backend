const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const bcrypt = require('bcryptjs');

const controllerPath = require.resolve('../dist/controllers/whatsapp.controller');
const aiPath = require.resolve('../dist/services/gemini.service');
const localMessages = require('../dist/services/whatsapp.messages');

function harness(stage = 'EMAIL') {
  const sent = [];
  let aiCalls = 0;
  const actor = {
    _id: 'owner-test', role: 'OWNER', phoneNumber: '2348000000000',
    registrationStage: stage, subscriptionStatus: 'trial', businessName: 'Shop', name: 'Ada',
    settings: { language: 'English', utcOffsetMinutes: 60 }, messageHistory: [],
    async save() {},
  };
  const queues = new Proxy({}, { get: (_, name) => async (...args) => { sent.push({ name, args }); } });
  const services = {
    '../config/env': { env: {} },
    '../models/user.model': { User: {
      updateOne: async () => {},
      findOne: async (query) => query.phoneNumber ? actor : null,
    } },
    '../models/adminSettings.model': { AdminSettings: { findOne: () => ({ lean: async () => null }) } },
    '../models/supportTicket.model': { SupportTicket: { findOne: async () => null } },
    '../services/support.service': { supportService: { handleAgentWhatsAppMessage: async () => false } },
    '../services/queue.service': queues,
    '../services/whatsapp.service': { sendWhatsAppText: async () => {} },
    '../services/billing.service': { checkSubscriptionStatus: async () => true },
    '../services/promoCode.service': { extractPromoCodeCandidate: () => null },
    '../services/whatsapp.messages': localMessages,
  };
  const originalLoad = Module._load;
  delete require.cache[controllerPath];
  Module._load = function(request, parent, ...rest) {
    if (parent?.filename === controllerPath && request.startsWith('.')) {
      if (request === '../utils/dates') return originalLoad.call(this, request, parent, ...rest);
      return services[request] || {};
    }
    return originalLoad.call(this, request, parent, ...rest);
  };
  let controller;
  try { controller = require(controllerPath); } finally { Module._load = originalLoad; }
  const priorAi = require.cache[aiPath];
  require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: {
    parseMessageWithGemini: async () => { aiCalls++; return { intent: 'UNKNOWN', reply_text: 'Parsed document' }; },
  } };
  return {
    actor, sent, aiCalls: () => aiCalls,
    send: (text) => controller.handleMessageLogic(actor.phoneNumber, text, 'test-message'),
    close() {
      delete require.cache[controllerPath];
      if (priorAi) require.cache[aiPath] = priorAi;
      else delete require.cache[aiPath];
    },
  };
}

test('WhatsApp text signup completes with no AI calls or password history', async () => {
  const h = harness();
  try {
    await h.send('ada@example.com');
    assert.equal(h.actor.registrationStage, 'PASSWORD');
    await h.send('private-password');
    assert.equal(h.actor.interactionState.type, 'WAITING_FOR_PASSWORD_CONFIRM');
    assert.equal(h.actor.interactionState.data.tempPassword, undefined);
    assert.ok(await bcrypt.compare('private-password', h.actor.interactionState.data.passwordHash));
    await h.send('private-password');
    assert.equal(h.actor.registrationStage, 'SHOP_NAME_SELECTION');
    assert.equal(h.actor.interactionState, null);
    await h.send('Ada Stores');
    assert.equal(h.actor.registrationStage, 'COMPLETED');
    assert.equal(h.actor.businessName, 'Ada Stores');
    assert.ok(await bcrypt.compare('private-password', h.actor.password));
    assert.equal(h.aiCalls(), 0);
    assert.ok(h.sent.some(({ name }) => name === 'queueRegistrationComplete'));
    assert.ok(!JSON.stringify(h.actor.messageHistory).includes('private-password'));
  } finally { h.close(); }
});

test('password mismatch resets signup without calling AI', async () => {
  const h = harness('PASSWORD');
  try {
    await h.send('first-password');
    await h.send('different-password');
    assert.equal(h.actor.registrationStage, 'PASSWORD');
    assert.equal(h.actor.interactionState, null);
    assert.ok(h.sent.some(({ args }) => String(args[1]).includes('Passwords do not match')));
    assert.equal(h.aiCalls(), 0);
  } finally { h.close(); }
});

test('form signup reaches shop selection without storing credentials in history', async () => {
  const h = harness();
  try {
    await h.send('__FLOW__:' + JSON.stringify({ email: 'ada@example.com', password: 'private-password', confirm_password: 'private-password' }));
    assert.equal(h.actor.registrationStage, 'SHOP_NAME_SELECTION');
    assert.ok(!JSON.stringify(h.actor.messageHistory).includes('private-password'));
    await h.send('__BTN__:CMD_USE_PROFILE_NAME:Use profile name');
    assert.equal(h.actor.registrationStage, 'COMPLETED');
    assert.equal(h.aiCalls(), 0);
  } finally { h.close(); }
});

test('unfinished registration never falls through to the paid parser', async () => {
  const h = harness('OTP_PENDING');
  try {
    await h.send('create receipt for Ada');
    assert.equal(h.aiCalls(), 0);
    assert.ok(h.sent.some(({ args }) => String(args[1]).includes('complete your registration')));
  } finally { h.close(); }
});

test('Help button and text use local copy during and after signup', async () => {
  for (const stage of ['EMAIL', 'COMPLETED']) {
    for (const text of ['help', '__BTN__:CMD_HELP:Help']) {
      const h = harness(stage);
      try {
        await h.send(text);
        assert.equal(h.aiCalls(), 0);
        assert.ok(h.sent.some(({ args }) => String(args[1]).includes('TallyPadi Help')));
      } finally { h.close(); }
    }
  }
});

test('post-signup guidance buttons work without loading AI', async () => {
  for (const id of ['CMD_RECORD_INVENTORY', 'CMD_RECORD_SALE', 'CMD_RECORD_CREDIT', 'CMD_DELETE_STOCK', 'CMD_SET_STOCK', 'CMD_SET_PRICE', 'CMD_RECORD_EXPENSE', 'CMD_ADD_STAFF']) {
    const h = harness('COMPLETED');
    try {
      await h.send(`__BTN__:${id}:Action`);
      assert.equal(h.aiCalls(), 0);
      assert.ok(h.sent.length > 0);
    } finally { h.close(); }
  }
});


test('receipt requests from registered users still reach the document parser', async () => {
  const h = harness('COMPLETED');
  try {
    await h.send('receipt for Ada: 2 bags of rice at 5000 each');
    assert.equal(h.aiCalls(), 1);
  } finally { h.close(); }
});

test('password confirmations already started before upgrade still complete', async () => {
  const h = harness('PASSWORD');
  h.actor.interactionState = { type: 'WAITING_FOR_PASSWORD_CONFIRM', data: { tempPassword: 'legacy-password' } };
  h.actor.messageHistory = ['legacy-password'];
  try {
    await h.send('legacy-password');
    assert.equal(h.actor.registrationStage, 'SHOP_NAME_SELECTION');
    assert.equal(h.actor.interactionState, null);
    assert.ok(await bcrypt.compare('legacy-password', h.actor.password));
    assert.ok(!h.actor.messageHistory.includes('legacy-password'));
    assert.equal(h.aiCalls(), 0);
  } finally { h.close(); }
});
