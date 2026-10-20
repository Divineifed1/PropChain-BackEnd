import {
  buildOtpAuthUrl,
  buildQrCodeUrl,
  createSha256,
  decodeBase32,
  generateBackupCodes,
  generateReactivationToken,
  generateTotpCode,
  parseDuration,
  randomBase32Secret,
  randomToken,
  redactEmail,
  sanitizeUser,
  verifyBackupCode,
  verifyTotpCode,
} from './security.utils';

// RFC 6238 test secret: ASCII "12345678901234567890" in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('security.utils', () => {
  describe('sanitizeUser', () => {
    it('removes password and two-factor secrets but keeps other fields', () => {
      const user = {
        id: 'u1',
        email: 'a@example.com',
        password: 'hash',
        twoFactorSecret: 'secret',
        twoFactorBackupCodes: ['x'],
      };
      expect(sanitizeUser(user)).toEqual({ id: 'u1', email: 'a@example.com' });
    });

    it('does not mutate its input', () => {
      const user = { id: 'u1', password: 'hash' };
      sanitizeUser(user);
      expect(user.password).toBe('hash');
    });
  });

  describe('hashing helpers', () => {
    it('createSha256 matches the known digest of "abc"', () => {
      expect(createSha256('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('redactEmail is a short, stable, non-reversible token', () => {
      const redacted = redactEmail('user@example.com');
      expect(redacted).toHaveLength(8);
      expect(redacted).toBe(redactEmail('user@example.com'));
      expect(redacted).not.toContain('user');
      expect(redacted).not.toBe(redactEmail('other@example.com'));
    });

    it('randomToken returns 2*size hex characters and differs between calls', () => {
      const a = randomToken(16);
      expect(a).toMatch(/^[0-9a-f]{32}$/);
      expect(a).not.toBe(randomToken(16));
    });

    it('generateReactivationToken returns a token and its sha256 hash', () => {
      const { token, hash } = generateReactivationToken();
      expect(hash).toBe(createSha256(token));
    });
  });

  describe('base32', () => {
    it('randomBase32Secret has the requested length and alphabet', () => {
      expect(randomBase32Secret(20)).toMatch(/^[A-Z2-7]{20}$/);
    });

    it('decodeBase32 decodes the RFC 6238 secret', () => {
      expect(decodeBase32(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
    });

    it('decodeBase32 ignores padding, case and characters outside the alphabet', () => {
      expect(decodeBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq==').toString('ascii')).toBe(
        '12345678901234567890',
      );
    });
  });

  describe('backup codes', () => {
    it('generates the requested number of 8-character upper-case hex codes', () => {
      const codes = generateBackupCodes(5);
      expect(codes).toHaveLength(5);
      codes.forEach((code) => expect(code).toMatch(/^[0-9A-F]{8}$/));
    });

    it('verifyBackupCode finds the matching hash, ignoring case and whitespace', () => {
      const hashes = ['ABCD1234', 'DEADBEEF'].map(createSha256);
      expect(verifyBackupCode('  deadbeef ', hashes)).toBe(hashes[1]);
    });

    it('verifyBackupCode returns undefined for an unknown code or no hashes', () => {
      expect(verifyBackupCode('00000000', [createSha256('ABCD1234')])).toBeUndefined();
      expect(verifyBackupCode('ABCD1234', [])).toBeUndefined();
    });
  });

  describe('TOTP', () => {
    it('matches the RFC 6238 SHA-1 test vectors', () => {
      // T = 59s -> 94287082 (8 digits); the 6-digit code is its last six digits.
      expect(generateTotpCode({ secret: RFC_SECRET, digits: 8, timestamp: 59_000 })).toBe(
        '94287082',
      );
      expect(generateTotpCode({ secret: RFC_SECRET, timestamp: 59_000 })).toBe('287082');
      // T = 1111111109s -> 07081804 (8 digits).
      expect(
        generateTotpCode({ secret: RFC_SECRET, digits: 8, timestamp: 1_111_111_109_000 }),
      ).toBe('07081804');
    });

    it('verifyTotpCode accepts the current code and one adjacent period', () => {
      const now = 59_000;
      expect(verifyTotpCode({ secret: RFC_SECRET, code: '287082', timestamp: now })).toBe(true);
      // Same code, verified 30s later: still inside the +/-1 window.
      expect(verifyTotpCode({ secret: RFC_SECRET, code: '287082', timestamp: now + 30_000 })).toBe(
        true,
      );
    });

    it('verifyTotpCode rejects codes outside the window or when the window is 0', () => {
      expect(
        verifyTotpCode({ secret: RFC_SECRET, code: '287082', timestamp: 59_000 + 90_000 }),
      ).toBe(false);
      expect(
        verifyTotpCode({
          secret: RFC_SECRET,
          code: '287082',
          timestamp: 59_000 + 30_000,
          window: 0,
        }),
      ).toBe(false);
      expect(verifyTotpCode({ secret: RFC_SECRET, code: '000000', timestamp: 59_000 })).toBe(false);
    });

    it('verifyTotpCode trims whitespace around the submitted code', () => {
      expect(verifyTotpCode({ secret: RFC_SECRET, code: ' 287082 ', timestamp: 59_000 })).toBe(
        true,
      );
    });
  });

  describe('otpauth URLs', () => {
    it('buildOtpAuthUrl encodes the label and issuer', () => {
      const url = buildOtpAuthUrl('a+b@example.com', RFC_SECRET, 'Prop Chain');
      expect(url).toBe(
        `otpauth://totp/Prop%20Chain%3Aa%2Bb%40example.com?secret=${RFC_SECRET}&issuer=Prop%20Chain&algorithm=SHA1&digits=6&period=30`,
      );
    });

    it('buildQrCodeUrl url-encodes the otpauth URL', () => {
      const otp = buildOtpAuthUrl('a@example.com', RFC_SECRET);
      expect(buildQrCodeUrl(otp)).toBe(`https://quickchart.io/qr?text=${encodeURIComponent(otp)}`);
    });
  });

  describe('parseDuration', () => {
    it.each([
      ['30s', 30],
      ['15m', 900],
      ['2h', 7200],
      ['7d', 604800],
      ['45', 45],
      ['5M', 300],
    ])('parses %s as %i seconds', (input, expected) => {
      expect(parseDuration(input, 1)).toBe(expected);
    });

    it.each([[''], ['   '], ['abc'], ['-5'], ['0']])('falls back for %p', (input) => {
      expect(parseDuration(input, 99)).toBe(99);
    });
  });
});
