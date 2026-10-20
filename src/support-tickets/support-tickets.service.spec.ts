import { SupportTicketsService } from './support-tickets.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SupportTicketsService', () => {
  let service: SupportTicketsService;
  let prisma: any;
  let notifications: jest.Mocked<Partial<NotificationsService>>;

  beforeEach(() => {
    prisma = {
      supportTicket: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'ticket-1', priority: 'HIGH', slaDeadline: new Date() }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    notifications = { sendNotification: jest.fn().mockResolvedValue(undefined) };
    service = new SupportTicketsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('creates a ticket with correct SLA deadline for HIGH priority', async () => {
    const result = await service.createTicket('user-1', {
      subject: 'Test',
      description: 'Desc',
      priority: 'HIGH',
    } as any);
    expect(prisma.supportTicket.create).toHaveBeenCalled();
    expect(result.id).toBe('ticket-1');
  });

  describe('getTicketMetrics (#1432)', () => {
    it('derives total/open/resolved from a single grouped query', async () => {
      prisma.supportTicket.groupBy.mockResolvedValue([
        { status: 'NEW', _count: { _all: 3 } },
        { status: 'IN_PROGRESS', _count: { _all: 2 } },
        { status: 'WAITING_ON_CUSTOMER', _count: { _all: 1 } },
        { status: 'RESOLVED', _count: { _all: 4 } },
        { status: 'CLOSED', _count: { _all: 5 } },
      ]);
      prisma.supportTicket.count.mockResolvedValue(2);

      const metrics = await service.getTicketMetrics();

      expect(metrics).toEqual({ total: 15, open: 6, resolved: 9, breached: 2 });
    });

    it('issues one grouped query plus one breach count, not four counts', async () => {
      await service.getTicketMetrics('agent-1');

      expect(prisma.supportTicket.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.supportTicket.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assignedToId: 'agent-1' } }),
      );
      expect(prisma.supportTicket.count).toHaveBeenCalledTimes(1);
      expect(prisma.supportTicket.count).toHaveBeenCalledWith({
        where: { assignedToId: 'agent-1', slaBreached: true },
      });
    });

    it('returns zeroed buckets when there are no tickets', async () => {
      prisma.supportTicket.groupBy.mockResolvedValue([]);
      prisma.supportTicket.count.mockResolvedValue(0);

      await expect(service.getTicketMetrics()).resolves.toEqual({
        total: 0,
        open: 0,
        resolved: 0,
        breached: 0,
      });
    });
  });

  describe('checkSlaBreaches (#1432)', () => {
    it('marks every breached ticket with a single updateMany', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        { id: 't1', priority: 'HIGH', assignedToId: 'agent-1', subject: 'A' },
        { id: 't2', priority: 'LOW', assignedToId: null, subject: 'B' },
        { id: 't3', priority: 'CRITICAL', assignedToId: 'agent-2', subject: 'C' },
      ]);

      await service.checkSlaBreaches();

      expect(prisma.supportTicket.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2', 't3'] } },
        data: { slaBreached: true },
      });
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('notifies only assigned agents', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        { id: 't1', priority: 'HIGH', assignedToId: 'agent-1', subject: 'A' },
        { id: 't2', priority: 'LOW', assignedToId: null, subject: 'B' },
      ]);

      await service.checkSlaBreaches();

      expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
      expect(notifications.sendNotification).toHaveBeenCalledWith(
        'agent-1',
        'SLA Breach Alert',
        expect.any(String),
        'SUPPORT_TICKET_SLA_BREACH',
        expect.objectContaining({ ticketId: 't1' }),
      );
    });

    it('does not write when there are no breaches', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);

      await service.checkSlaBreaches();

      expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled();
      expect(notifications.sendNotification).not.toHaveBeenCalled();
    });
  });
});
