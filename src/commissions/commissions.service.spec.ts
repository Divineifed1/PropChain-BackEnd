import { Test, TestingModule } from '@nestjs/testing';
import { CommissionsService } from './commissions.service';
import { PrismaService } from '../database/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('CommissionsService', () => {
  let service: CommissionsService;

  const mockPrismaService = {
    transaction: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    commission: {
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCommissionsForTransaction', () => {
    it('creates commission records based on assigned agents and commission rates', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: new Decimal('500000'),
        status: 'PENDING',
        propertyId: 'prop-1',
        property: {
          agents: [
            { agentId: 'agent-1', commissionRate: new Decimal('0.02') },
            { agentId: 'agent-2', commissionRate: new Decimal('0.035') },
          ],
        },
      });
      mockPrismaService.commission.findMany.mockResolvedValue([]);

      await service.createCommissionsForTransaction('tx-1');

      expect(mockPrismaService.commission.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.commission.createMany).toHaveBeenCalledWith({
        data: [
          {
            transactionId: 'tx-1',
            agentId: 'agent-1',
            propertyId: 'prop-1',
            amount: new Decimal('10000.00'), // 500000 * 0.02
            rate: new Decimal('0.02'),
            status: 'PENDING',
          },
          {
            transactionId: 'tx-1',
            agentId: 'agent-2',
            propertyId: 'prop-1',
            amount: new Decimal('17500.000'), // 500000 * 0.035
            rate: new Decimal('0.035'),
            status: 'PENDING',
          },
        ],
      });
    });

    it('does not issue a query per agent (no N+1)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: new Decimal('100000'),
        status: 'PENDING',
        propertyId: 'prop-1',
        property: {
          agents: Array.from({ length: 25 }, (_, i) => ({
            agentId: `agent-${i}`,
            commissionRate: new Decimal('0.01'),
          })),
        },
      });
      mockPrismaService.commission.findMany.mockResolvedValue([]);

      await service.createCommissionsForTransaction('tx-1');

      // Exactly three queries total: transaction, existing-commissions, insert.
      expect(mockPrismaService.commission.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.commission.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.commission.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.commission.create).not.toHaveBeenCalled();
    });

    it('skips agents that already have a commission record', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: new Decimal('500000'),
        status: 'PENDING',
        propertyId: 'prop-1',
        property: {
          agents: [
            { agentId: 'agent-1', commissionRate: new Decimal('0.02') },
            { agentId: 'agent-2', commissionRate: new Decimal('0.035') },
          ],
        },
      });
      mockPrismaService.commission.findMany.mockResolvedValue([{ agentId: 'agent-1' }]);

      await service.createCommissionsForTransaction('tx-1');

      expect(mockPrismaService.commission.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ agentId: 'agent-2' })],
      });
    });

    it('does not touch the database when every agent already has a commission', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: new Decimal('500000'),
        status: 'PENDING',
        propertyId: 'prop-1',
        property: { agents: [{ agentId: 'agent-1', commissionRate: new Decimal('0.02') }] },
      });
      mockPrismaService.commission.findMany.mockResolvedValue([{ agentId: 'agent-1' }]);

      await service.createCommissionsForTransaction('tx-1');

      expect(mockPrismaService.commission.createMany).not.toHaveBeenCalled();
    });

    it('does nothing when the transaction has no assigned agents', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: new Decimal('500000'),
        status: 'PENDING',
        propertyId: 'prop-1',
        property: { agents: [] },
      });

      await service.createCommissionsForTransaction('tx-1');

      expect(mockPrismaService.commission.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.commission.createMany).not.toHaveBeenCalled();
    });
  });

  describe('updateCommissionsStatus', () => {
    it('syncs statuses with transaction', async () => {
      mockPrismaService.commission.updateMany.mockResolvedValue({ count: 2 });

      await service.updateCommissionsStatus('tx-1', 'COMPLETED');

      expect(mockPrismaService.commission.updateMany).toHaveBeenCalledWith({
        where: { transactionId: 'tx-1' },
        data: { status: 'COMPLETED' },
      });
    });
  });

  describe('findAll', () => {
    it('enforces agent filter for AGENT users', async () => {
      mockPrismaService.commission.findMany.mockResolvedValue([]);
      mockPrismaService.commission.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 10 },
        { sub: 'agent-1', email: 'agent@test.com', role: 'AGENT', tier: 'FREE', type: 'access' },
      );

      expect(mockPrismaService.commission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentId: 'agent-1' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws Forbidden if agent requests another agent commission record', async () => {
      mockPrismaService.commission.findUnique.mockResolvedValue({
        id: 'c-1',
        agentId: 'agent-1',
        amount: new Decimal('1000'),
        rate: new Decimal('0.03'),
        property: { price: new Decimal('100000') },
        transaction: { amount: new Decimal('100000') },
      });

      await expect(
        service.findOne('c-1', {
          sub: 'agent-2',
          email: 'agent2@test.com',
          role: 'AGENT',
          tier: 'FREE',
          type: 'access',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getStats', () => {
    it('computes metrics globally for administrators from grouped queries', async () => {
      mockPrismaService.commission.groupBy
        .mockResolvedValueOnce([
          { status: 'COMPLETED', _sum: { amount: new Decimal('30000') }, _count: { _all: 3 } },
          { status: 'PENDING', _sum: { amount: new Decimal('15000') }, _count: { _all: 2 } },
          { status: 'CANCELLED', _sum: { amount: new Decimal('0') }, _count: { _all: 0 } },
        ])
        .mockResolvedValueOnce([
          { agentId: 'agent-1', status: 'COMPLETED', _sum: { amount: new Decimal('10000') } },
          { agentId: 'agent-1', status: 'PENDING', _sum: { amount: new Decimal('5000') } },
        ]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'agent-1', firstName: 'Agent', lastName: 'One', email: 'a1@test.com' },
      ]);

      const result = await service.getStats({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        tier: 'FREE',
        type: 'access',
      });

      expect(result.totalEarned).toBe(30000);
      expect(result.totalPending).toBe(15000);
      expect(result.agentStats).toEqual([
        expect.objectContaining({
          agentId: 'agent-1',
          name: 'Agent One',
          email: 'a1@test.com',
          earned: 10000,
          pending: 5000,
        }),
      ]);
    });

    it('aggregates admin stats with a bounded number of queries regardless of row count', async () => {
      mockPrismaService.commission.groupBy
        .mockResolvedValueOnce([
          { status: 'COMPLETED', _sum: { amount: new Decimal('1') }, _count: { _all: 1 } },
        ])
        .mockResolvedValueOnce([]);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.getStats({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        tier: 'FREE',
        type: 'access',
      });

      // Two grouped queries + one bounded agent lookup: no full-table findMany.
      expect(mockPrismaService.commission.groupBy).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.commission.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.commission.aggregate).not.toHaveBeenCalled();
      expect(mockPrismaService.commission.count).not.toHaveBeenCalled();
    });

    it('skips the agent lookup when there are no commissions', async () => {
      mockPrismaService.commission.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.getStats({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        tier: 'FREE',
        type: 'access',
      });

      expect(mockPrismaService.user.findMany).not.toHaveBeenCalled();
      expect(result.agentStats).toEqual([]);
      expect(result.completedCount).toBe(0);
      expect(result.pendingCount).toBe(0);
    });

    it('computes metrics for an agent with a single grouped query', async () => {
      mockPrismaService.commission.groupBy.mockResolvedValueOnce([
        { status: 'COMPLETED', _sum: { amount: new Decimal('7000') }, _count: { _all: 4 } },
        { status: 'PENDING', _sum: { amount: new Decimal('2000') }, _count: { _all: 1 } },
      ]);

      const result = await service.getStats({
        sub: 'agent-1',
        email: 'a1@test.com',
        role: 'AGENT',
        tier: 'FREE',
        type: 'access',
      });

      expect(result).toEqual({
        earned: 7000,
        pending: 2000,
        completedCount: 4,
        pendingCount: 1,
      });
      expect(mockPrismaService.commission.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.commission.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { agentId: 'agent-1' } }),
      );
      expect(mockPrismaService.commission.aggregate).not.toHaveBeenCalled();
      expect(mockPrismaService.commission.count).not.toHaveBeenCalled();
    });

    it('defaults missing status buckets to zero for an agent', async () => {
      mockPrismaService.commission.groupBy.mockResolvedValueOnce([]);

      const result = await service.getStats({
        sub: 'agent-1',
        email: 'a1@test.com',
        role: 'AGENT',
        tier: 'FREE',
        type: 'access',
      });

      expect(result).toEqual({ earned: 0, pending: 0, completedCount: 0, pendingCount: 0 });
    });
  });
});
