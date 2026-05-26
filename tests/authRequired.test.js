const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { authRequired } = require('../dist/middleware/authRequired');
const { User } = require('../dist/models/user.model');

test('authRequired hydrates ownerId for existing staff tokens', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';

  const originalFindById = User.findById;
  User.findById = () => ({
    select: () => ({
      lean: async () => ({ role: 'STAFF', ownerId: 'owner-123' }),
    }),
  });

  const token = jwt.sign({ id: 'staff-123', role: 'STAFF' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
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

  try {
    let nextCalled = false;
    await authRequired(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, 'staff-123');
    assert.equal(req.user.role, 'STAFF');
    assert.equal(req.user.ownerId, 'owner-123');
  } finally {
    User.findById = originalFindById;
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});
