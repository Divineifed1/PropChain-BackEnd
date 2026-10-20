import { NotFoundException } from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { PrismaService } from '../database/prisma.service';

describe('InvestmentsService', () => {
  let service: InvestmentsService;

  const prisma = {
    property: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvestmentsService(prisma as unknown as PrismaService);
  });

  it('returns the investment metrics for a property', async () => {
    const metrics = { id: 'p1', capRate: 5, roi: 12, rentalYield: 4, cashFlow: 900 };
    prisma.property.findUnique.mockResolvedValue(metrics);

    await expect(service.getMetrics('p1')).resolves.toEqual(metrics);
  });

  it('throws NotFoundException when the property does not exist', async () => {
    prisma.property.findUnique.mockResolvedValue(null);

    await expect(service.getMetrics('missing')).rejects.toThrow(NotFoundException);
  });

  it('reports ok when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('InvestmentAPI');
  });

  it('reports error when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));

    const result = await service.health();
    expect(result.status).toBe('error');
  });
});
