const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPasswordResetCode,
  hashPasswordResetCode,
  passwordResetCodeMatches,
  validateResetPassword,
} = require('../dist/services/passwordReset.service');
const { User } = require('../dist/models/user.model');
const { getSupportNotificationRecipients } = require('../dist/services/email.service');

test('password reset codes are six secure numeric digits and stored as hashes', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-password-reset-secret';

  try {
    const code = createPasswordResetCode();
    assert.match(code, /^\d{6}$/);

    const hash = hashPasswordResetCode('user-123', code);
    assert.equal(hash.length, 64);
    assert.equal(hash.includes(code), false);
    assert.equal(passwordResetCodeMatches({ userId: 'user-123', code, expectedHash: hash }), true);
    assert.equal(passwordResetCodeMatches({ userId: 'user-456', code, expectedHash: hash }), false);
    assert.equal(passwordResetCodeMatches({ userId: 'user-123', code: '000000', expectedHash: hash }), code === '000000');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('password reset requires a reasonably strong password', () => {
  assert.match(validateResetPassword('short1'), /between 8 and 128/);
  assert.match(validateResetPassword('onlyletters'), /letter and one number/);
  assert.match(validateResetPassword('123456789'), /letter and one number/);
  assert.equal(validateResetPassword('Secure123'), null);
});

test('password reset secrets are excluded from ordinary user queries', () => {
  assert.equal(User.schema.path('passwordResetCodeHash').options.select, false);
  assert.equal(User.schema.path('passwordResetExpires').options.select, false);
  assert.equal(User.schema.path('passwordResetAttempts').options.select, false);
});

test('support notifications always include the company support mailbox', () => {
  assert.equal(getSupportNotificationRecipients().includes('support@tallypadi.com'), true);
});
