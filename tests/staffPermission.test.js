const assert = require('node:assert/strict');
const test = require('node:test');

const {
  requireOwnerAccount,
  requireStaffPermission,
} = require('../dist/middleware/staffPermission');
const { User } = require('../dist/models/user.model');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

const query = (value) => ({
  select() { return this; },
  async lean() { return value; },
});

test('staff permissions are read from the owner and deny disabled actions', async () => {
  const originalFindById = User.findById;
  User.findById = (id) => query(id === 'staff-1'
    ? { role: 'STAFF', ownerId: 'owner-1' }
    : { settings: { staffPermissions: { canManageInventory: false } } });

  try {
    const req = { user: { id: 'staff-1', role: 'STAFF' } };
    const res = response();
    let nextCalled = false;
    await requireStaffPermission('canManageInventory')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.permission, 'canManageInventory');
  } finally {
    User.findById = originalFindById;
  }
});

test('staff permissions allow actions enabled by the owner', async () => {
  const originalFindById = User.findById;
  User.findById = (id) => query(id === 'staff-1'
    ? { role: 'STAFF', ownerId: 'owner-1' }
    : { settings: { staffPermissions: { canViewReports: true } } });

  try {
    const req = { user: { id: 'staff-1', role: 'STAFF' } };
    const res = response();
    let nextCalled = false;
    await requireStaffPermission('canViewReports')(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    User.findById = originalFindById;
  }
});

test('owner-only middleware checks the database role', async () => {
  const originalFindById = User.findById;
  User.findById = () => query({ role: 'STAFF' });

  try {
    const req = { user: { id: 'staff-1', role: 'OWNER' } };
    const res = response();
    let nextCalled = false;
    await requireOwnerAccount(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  } finally {
    User.findById = originalFindById;
  }
});
