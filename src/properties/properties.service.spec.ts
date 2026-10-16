import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { GeocodingService } from './geocoding.service';
import { CacheService } from '../cache/cache.service';
import { AppLogger } from '../common/logger';
import { PropertyStatus, UserRole } from '../types/prisma.types';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { DEFAULT_PROPERTY_STATUS } from './property-status.constants';

describe('PropertiesService', () => {
  let service: PropertiesService;

  const prisma = {
    property: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const fraud = { evaluatePropertyCreated: jest.fn() };
  const geocoding = { geocodeAddress: jest.fn(), hasAddressChanged: jest.fn().mockReturnValue(false) };
  const cache = { invalidateByTag: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn() };

  // Coordinates are supplied so the geocoding path is not involved.
  const createDto = {
    title: 'Loft',
    address: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '73301',
    country: 'USA',
    price: 250000,
    propertyType: 'APARTMENT',
    squareFeet: 900,
    latitude: 30.26,
    longitude: -97.74,
  };

  const user = (role: UserRole, sub = 'user-1') => ({ sub, role }) as unknown as AuthUserPayload;

  beforeEach(async () => {
    jest.resetAllMocks();
    geocoding.hasAddressChanged.mockReturnValue(false);
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: FraudService, useValue: fraud },
        { provide: GeocodingService, useValue: geocoding },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(PropertiesService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    beforeEach(() => {
      prisma.property.findFirst.mockResolvedValue(null);
      prisma.property.create.mockImplementation(async ({ data }: { data: unknown }) => ({
        id: 'p1',
        ...(data as object),
      }));
    });

    it('rejects a duplicate address', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto as never, 'owner-1')).rejects.toThrow(BadRequestException);
      expect(prisma.property.create).not.toHaveBeenCalled();
    });

    it('checks for duplicates on the full address', async () => {
      await service.create(createDto as never, 'owner-1');
      expect(prisma.property.findFirst).toHaveBeenCalledWith({
        where: {
          address: '1 Main St',
          city: 'Austin',
          state: 'TX',
          zipCode: '73301',
          country: 'USA',
        },
      });
    });

    it('creates a pending property connected to its owner, with Decimal money fields', async () => {
      await service.create(createDto as never, 'owner-1');

      const data = prisma.property.create.mock.calls[0][0].data;
      expect(data.status).toBe(DEFAULT_PROPERTY_STATUS);
      expect(data.owner).toEqual({ connect: { id: 'owner-1' } });
      expect(data.price).toEqual(new Decimal('250000'));
      expect(data.squareFeet).toEqual(new Decimal('900'));
      expect(data.lotSize).toBeNull();
      expect(data.hoaMonthlyFee).toBeNull();
      expect(data.latitude).toBe(30.26);
      expect(geocoding.geocodeAddress).not.toHaveBeenCalled();
    });

    it('runs the fraud check and invalidates the property cache', async () => {
      await service.create(createDto as never, 'owner-1');
      expect(fraud.evaluatePropertyCreated).toHaveBeenCalledWith('p1');
      expect(cache.invalidateByTag).toHaveBeenCalledTimes(1);
    });

    it('still returns the created property when the fraud check fails', async () => {
      fraud.evaluatePropertyCreated.mockRejectedValue(new Error('fraud service down'));

      await expect(service.create(createDto as never, 'owner-1')).resolves.toMatchObject({ id: 'p1' });
      expect(cache.invalidateByTag).toHaveBeenCalled();
    });

    it('still returns the created property when cache invalidation fails', async () => {
      cache.invalidateByTag.mockRejectedValue(new Error('redis down'));

      await expect(service.create(createDto as never, 'owner-1')).resolves.toMatchObject({ id: 'p1' });
    });
  });

  describe('findOne / findByOwnerId', () => {
    it('findOne returns null for an unknown id', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).resolves.toBeNull();
      expect(prisma.property.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'missing' } }),
      );
    });

    it('findOne exposes only public owner fields', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1' });
      await service.findOne('p1');
      const include = prisma.property.findUnique.mock.calls[0][0].include;
      expect(Object.keys(include.owner.select).sort()).toEqual(['email', 'firstName', 'id', 'lastName']);
    });

    it('findByOwnerId lists the owner\'s properties newest first', async () => {
      prisma.property.findMany.mockResolvedValue([]);
      await service.findByOwnerId('owner-1');
      expect(prisma.property.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFound for an unknown property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', user(UserRole.ADMIN))).rejects.toThrow(NotFoundException);
    });

    it('forbids someone who is neither the owner nor an admin', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      await expect(service.remove('p1', user(UserRole.USER, 'stranger'))).rejects.toThrow(ForbiddenException);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it.each([
      ['the owner', UserRole.USER, 'owner-1'],
      ['an admin', UserRole.ADMIN, 'admin-1'],
    ])('soft-deletes for %s', async (_label, role, sub) => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      prisma.property.update.mockResolvedValue({ id: 'p1', deleted: true });

      await service.remove('p1', user(role, sub));

      const args = prisma.property.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'p1' });
      expect(args.data).toMatchObject({
        deleted: true,
        deletedById: sub,
        status: PropertyStatus.ARCHIVED,
      });
      expect(args.data.deletedAt).toBeInstanceOf(Date);
      expect(cache.invalidateByTag).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('throws NotFound for an unknown property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.restore('missing', user(UserRole.ADMIN))).rejects.toThrow(NotFoundException);
    });

    it('is admin-only, even for the owner', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      await expect(service.restore('p1', user(UserRole.USER, 'owner-1'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('un-deletes the property as a draft and clears the deletion fields', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      prisma.property.update.mockResolvedValue({ id: 'p1' });

      await service.restore('p1', user(UserRole.ADMIN, 'admin-1'));

      expect(prisma.property.update.mock.calls[0][0].data).toEqual({
        deleted: false,
        deletedAt: null,
        deletedById: null,
        status: PropertyStatus.DRAFT,
      });
      expect(cache.invalidateByTag).toHaveBeenCalled();
    });
  });
});
