import { PrismaService } from '../database/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { AppLogger } from '../common/logger';
import { UsersService } from './users.service';

jest.mock('../auth/security.utils', () => ({
  ...jest.requireActual('../auth/security.utils'),
  // bcrypt at 12 rounds is slow and irrelevant to what is being tested.
  hashPassword: jest.fn(async (password: string) => `hashed:${password}`),
}));

type Mock = jest.Mock;

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    loginHistory: { findMany: jest.fn() },
  } as unknown as { user: Record<string, Mock>; loginHistory: Record<string, Mock> };
}

describe('UsersService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: UsersService;

  beforeEach(() => {
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
    prisma = makePrisma();
    service = new UsersService(
      prisma as unknown as PrismaService,
      { revokeAllSessions: jest.fn() } as unknown as SessionsService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    const dto = {
      email: 'new@example.com',
      password: 'Str0ng!Pass',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(null); // referral code is free, no referrer
      prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'u1',
        ...data,
        twoFactorSecret: 'secret',
      }));
    });

    it('stores a hash, never the plain password, and strips secrets from the result', async () => {
      const result = await service.create(dto);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.password).toBe('hashed:Str0ng!Pass');
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('twoFactorSecret');
      expect(result).toMatchObject({ id: 'u1', email: 'new@example.com' });
    });

    it('seeds password history and default notification preferences', async () => {
      await service.create(dto);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHistory).toEqual({ create: { passwordHash: 'hashed:Str0ng!Pass' } });
      expect(data.preferences.create).toMatchObject({
        emailNotifications: true,
        inAppNotifications: true,
        smsNotifications: false,
      });
    });

    it('generates a 6-character upper-case referral code', async () => {
      await service.create(dto);
      expect(prisma.user.create.mock.calls[0][0].data.referralCode).toMatch(/^[0-9A-Z]{1,6}$/);
    });

    it('retries until the generated referral code is unused', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'taken' }) // first code collides
        .mockResolvedValueOnce(null); // second is free

      await service.create(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('links the new user to the referrer when a valid referral code is given', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // generated code is free
        .mockResolvedValueOnce({ id: 'referrer-1' }); // supplied code resolves

      await service.create({ ...dto, referralCode: 'FRIEND' });

      expect(prisma.user.findUnique).toHaveBeenLastCalledWith({ where: { referralCode: 'FRIEND' } });
      expect(prisma.user.create.mock.calls[0][0].data.referredById).toBe('referrer-1');
    });

    it('ignores an unknown referral code', async () => {
      await service.create({ ...dto, referralCode: 'NOPE' });
      expect(prisma.user.create.mock.calls[0][0].data.referredById).toBeNull();
    });
  });

  describe('lookups', () => {
    it('findOne only returns active users and selects public fields', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1' });

      await expect(service.findOne('u1')).resolves.toEqual({ id: 'u1' });

      const args = prisma.user.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'u1', isDeactivated: false });
      expect(args.select).not.toHaveProperty('password');
      expect(args.select).toMatchObject({ email: true, role: true });
    });

    it('findOne returns null for an unknown or deactivated user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing')).resolves.toBeNull();
    });

    it('findByEmail looks up by exact email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await service.findByEmail('a@example.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@example.com' } });
    });
  });

  describe('admin state changes', () => {
    beforeEach(() => {
      prisma.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    });

    it('block / unblock toggle isBlocked', async () => {
      await service.block('u1');
      await service.unblock('u1');

      expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'u1' },
        data: { isBlocked: true },
      });
      expect(prisma.user.update.mock.calls[1][0]).toMatchObject({ data: { isBlocked: false } });
    });

    it('verify / unverify toggle isVerified and select only id and isVerified', async () => {
      await service.verify('u1');
      await service.unverify('u1');

      expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
        data: { isVerified: true },
        select: { id: true, isVerified: true },
      });
      expect(prisma.user.update.mock.calls[1][0]).toMatchObject({ data: { isVerified: false } });
    });

    it('remove deletes the user', async () => {
      prisma.user.delete.mockResolvedValue({ id: 'u1' });
      await expect(service.remove('u1')).resolves.toEqual({ id: 'u1' });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('referrals', () => {
    it('getReferralStats combines the referral code with the referral count', async () => {
      prisma.user.count.mockResolvedValue(3);
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'ABC123' });

      await expect(service.getReferralStats('u1')).resolves.toEqual({
        referralCode: 'ABC123',
        referralCount: 3,
      });
      expect(prisma.user.count).toHaveBeenCalledWith({ where: { referredById: 'u1' } });
    });

    it('getReferralStats tolerates a missing user', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getReferralStats('ghost')).resolves.toEqual({
        referralCode: undefined,
        referralCount: 0,
      });
    });

    it('getMyReferrals selects only non-sensitive fields', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.getMyReferrals('u1');

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ referredById: 'u1' });
      expect(Object.keys(args.select).sort()).toEqual(['createdAt', 'email', 'firstName', 'id', 'lastName']);
    });
  });

  describe('getLoginHistory', () => {
    it('returns the caller\'s logins newest first without extra fields', async () => {
      prisma.loginHistory.findMany.mockResolvedValue([{ timestamp: new Date(), ipAddress: '1.1.1.1' }]);

      await service.getLoginHistory('u1');

      const args = prisma.loginHistory.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ userId: 'u1' });
      expect(args.orderBy).toEqual({ timestamp: 'desc' });
      expect(args.select).toEqual({ timestamp: true, ipAddress: true, userAgent: true });
    });
  });
});
