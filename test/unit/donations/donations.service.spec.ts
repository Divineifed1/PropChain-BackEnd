import { Test } from '@nestjs/testing';
import { DonationsService } from '../../src/donations/donations.service';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { BlockchainService } from '../../src/blockchain/blockchain.service';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

describe('DonationsService', () => {
  let service: DonationsService;
  let prismaMock: any;
  let blockchainMock: any;
  let eventEmitter: EventEmitter;

  beforeEach(async () => {
    process.env.DONATION_WEBHOOK_SECRET = 'test-secret';

    prismaMock = {
      donation: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    blockchainMock = {
      getTransactionReceipt: jest.fn(),
    };

    eventEmitter = new EventEmitter();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DonationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: BlockchainService, useValue: blockchainMock },
        { provide: 'DONATION_EVENTS', useValue: eventEmitter },
      ],
    }).compile();

    service = moduleRef.get<DonationsService>(DonationsService);
  });

  it('throws UnauthorizedException when signature is missing', async () => {
    await expect(
      service.processWebhook(
        {
          provider: 'stripe',
          providerTransactionId: 't1',
          amount: 10,
          currency: 'USD',
        },
        undefined,
      ),
    ).rejects.toThrow('Missing webhook signature');
  });

  it('throws UnauthorizedException when signature is invalid', async () => {
    await expect(
      service.processWebhook(
        {
          provider: 'stripe',
          providerTransactionId: 't1',
          amount: 10,
          currency: 'USD',
        },
        'bad-signature',
      ),
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('processes and returns a donation when webhook is valid', async () => {
    const payload = {
      provider: 'stripe',
      providerTransactionId: 't2',
      amount: 25,
      currency: 'USD',
      blockchainHash: '0xabc',
    };

    const hmac = crypto.createHmac('sha256', process.env.DONATION_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');

    prismaMock.donation.findUnique.mockResolvedValue(null);
    blockchainMock.getTransactionReceipt.mockResolvedValue({ status: 1, confirmations: 3 });
    prismaMock.donation.create.mockResolvedValue({ ...payload, id: 'donation-1', status: 'CONFIRMED', createdAt: new Date(), updatedAt: new Date() });

    const eventSpy = jest.spyOn(eventEmitter, 'emit');
    const result = await service.processWebhook(payload as any, hmac);

    expect(result.isDuplicate).toBe(false);
    expect(result.donation.status).toBe('CONFIRMED');
    expect(prismaMock.donation.create).toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith('donation.created', expect.objectContaining({ providerTransactionId: 't2' }));
  });

  it('returns existing donation for duplicate webhook', async () => {
    const payload = {
      provider: 'stripe',
      providerTransactionId: 't3',
      amount: 5,
      currency: 'USD',
    };

    const hmac = crypto.createHmac('sha256', process.env.DONATION_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');

    prismaMock.donation.findUnique.mockResolvedValue({ id: 'donation-duplicate', ...payload, status: 'CONFIRMED', createdAt: new Date(), updatedAt: new Date() });

    const result = await service.processWebhook(payload as any, hmac);

    expect(result.isDuplicate).toBe(true);
    expect(result.donation.providerTransactionId).toBe('t3');
    expect(prismaMock.donation.create).not.toHaveBeenCalled();
  });
});
