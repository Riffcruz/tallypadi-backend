const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createUnsubscribeToken,
  decryptSmtpPassword,
  encryptSmtpPassword,
  verifyUnsubscribeToken,
} = require('../dist/services/emailSecurity.service');

test('SMTP credentials are encrypted and can be decrypted', () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  const previousEncryptionKey = process.env.SMTP_ENCRYPTION_KEY;
  process.env.JWT_SECRET = 'email-security-test-secret';
  process.env.SMTP_ENCRYPTION_KEY = 'dedicated-smtp-test-key';

  try {
    const encrypted = encryptSmtpPassword('smtp-secret-value');
    assert.match(encrypted, /^enc:v1:/);
    assert.notEqual(encrypted, 'smtp-secret-value');
    assert.equal(decryptSmtpPassword(encrypted), 'smtp-secret-value');
  } finally {
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
    if (previousEncryptionKey === undefined) delete process.env.SMTP_ENCRYPTION_KEY;
    else process.env.SMTP_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

test('unsubscribe tokens are signed and tied to the email address', () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'unsubscribe-test-secret';

  try {
    const token = createUnsubscribeToken(' User@Example.com ');
    assert.equal(verifyUnsubscribeToken(token), 'user@example.com');
    assert.throws(() => verifyUnsubscribeToken(`${token}tampered`));
  } finally {
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});
