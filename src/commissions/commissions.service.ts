import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Decimal } from '@prisma/client/runtime/library';
import { CommissionListQueryDto } from './dto/commission.dto';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically calculate and create commission records for a transaction
   */
  async createCommissionsForTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = await (this.prisma.transaction as any).findUnique({
        where: { id: transactionId },
        include: {
          property: {
            include: {
              agents: true,
            },
          },
        },
      });

      if (!transaction) {
        this.logger.error(`Transaction ${transactionId} not found when generating commissions`);
        return;
      }

      const agents = (transaction as any).property?.agents || [];
      this.logger.log(
        `Found ${agents.length} agents assigned to property for transaction ${transactionId}`,
      );

      if (agents.length === 0) {
        return;
      }

      // A single round-trip for the existing records replaces one findUnique per
      // agent (the previous N+1).
      const existing = await this.prisma.commission.findMany({
        where: {
          transactionId,
          agentId: { in: agents.map((a: any) => a.agentId) },
        },
        select: { agentId: true },
      });
      const existingAgentIds = new Set(existing.map((c: any) => c.agentId));

      const data: any[] = [];
      for (const agentAssignment of agents) {
        if (existingAgentIds.has(agentAssignment.agentId)) {
          this.logger.warn(
            `Commission for transaction ${transactionId} and agent ${agentAssignment.agentId} already exists`,
          );
          continue;
        }

        // Calculate commission amount
        const amount = transaction.amount.mul(agentAssignment.commissionRate);

        data.push({
          transactionId,
          agentId: agentAssignment.agentId,
          propertyId: transaction.propertyId,
          amount,
          rate: agentAssignment.commissionRate,
          status: transaction.status,
        });

        this.logger.log(
          `Created commission of ${amount.toString()} for agent ${agentAssignment.agentId} on transaction ${transactionId}`,
        );
      }

      if (data.length === 0) {
        return;
      }

      // One insert instead of one create per agent.
      await this.prisma.commission.createMany({ data });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to create commissions for transaction ${transactionId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Synchronize commission status with transaction status
   */
  async updateCommissionsStatus(transactionId: string, status: string): Promise<void> {
    try {
      const dbStatus =
        status === 'COMPLETED' ? 'COMPLETED' : status === 'CANCELLED' ? 'CANCELLED' : 'PENDING';

      const result = await this.prisma.commission.updateMany({
        where: { transactionId },
        data: { status: dbStatus as any },
      });

      this.logger.log(
        `Updated ${result.count} commission statuses to ${dbStatus} for transaction ${transactionId}`,
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to update commission statuses for transaction ${transactionId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Find commissions with pagination and filtering
   */
  async findAll(query: CommissionListQueryDto, user: AuthUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Access control: agents can only see their own commissions
    if (user.role === 'AGENT') {
      where.agentId = user.sub;
    } else if (query.agentId) {
      where.agentId = query.agentId;
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.transactionId) {
      where.transactionId = query.transactionId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.commission.findMany({
        where,
        skip,
        take: limit,
        include: {
          agent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          property: {
            select: {
              id: true,
              title: true,
              address: true,
            },
          },
          transaction: {
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commission.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      items: items.map((item: any) => ({
        ...item,
        amount: Number(item.amount),
        rate: Number(item.rate),
        transaction: {
          ...item.transaction,
          amount: Number(item.transaction.amount),
        },
      })),
    };
  }

  /**
   * Find details of a single commission record
   */
  async findOne(id: string, user: AuthUserPayload) {
    const commission = await this.prisma.commission.findUnique({
      where: { id },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
            address: true,
            price: true,
          },
        },
        transaction: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!commission) {
      throw new NotFoundException('Commission record not found');
    }

    // Access control: Admins can see all, Agents only their own
    if (user.role !== 'ADMIN' && commission.agentId !== user.sub) {
      throw new ForbiddenException('You are not authorized to view this commission record');
    }

    return {
      ...commission,
      amount: Number(commission.amount),
      rate: Number(commission.rate),
      property: {
        ...commission.property,
        price: Number(commission.property.price),
      },
      transaction: {
        ...commission.transaction,
        amount: Number(commission.transaction.amount),
      },
    };
  }

  /**
   * Get commission stats for the current user (Agent or Admin).
   *
   * Optimised to aggregate in the database instead of in Node: a single
   * `groupBy` returns the per-status sum and count that previously took five
   * round-trips (three `aggregate` + two `count`), and the per-agent breakdown
   * uses `groupBy` on `agentId` rather than loading *every* commission (with its
   * agent relation) into memory and folding it in JS.
   */
  async getStats(user: AuthUserPayload) {
    if (user.role === 'ADMIN') {
      // One grouped query replaces the three aggregate + two count round-trips.
      const statusGroups = await (this.prisma.commission as any).groupBy({
        by: ['status'],
        _sum: { amount: true },
        _count: { _all: true },
      });

      const totals = new Map<string, { sum: number; count: number }>();
      for (const group of statusGroups as Array<{
        status: string;
        _sum: { amount: unknown };
        _count: { _all: number };
      }>) {
        totals.set(group.status, {
          sum: Number(group._sum.amount || 0),
          count: group._count._all,
        });
      }

      const completed = totals.get('COMPLETED') ?? { sum: 0, count: 0 };
      const pending = totals.get('PENDING') ?? { sum: 0, count: 0 };
      const cancelled = totals.get('CANCELLED') ?? { sum: 0, count: 0 };

      // Per-agent breakdown: grouped in the database so we never load the full
      // commission table, then a bounded lookup for the (few) agent rows.
      const agentGroups = await (this.prisma.commission as any).groupBy({
        by: ['agentId', 'status'],
        _sum: { amount: true },
      });

      const agentIds = [
        ...new Set((agentGroups as Array<{ agentId: string }>).map((g) => g.agentId)),
      ];
      const agents =
        agentIds.length > 0
          ? await this.prisma.user.findMany({
              where: { id: { in: agentIds } },
              select: { id: true, firstName: true, lastName: true, email: true },
            })
          : [];

      const agentMap = new Map(
        agents.map((a) => [a.id, { name: `${a.firstName} ${a.lastName}`, email: a.email }]),
      );

      const agentStatsMap = new Map<
        string,
        { name: string; email: string; earned: number; pending: number }
      >();
      for (const group of agentGroups as Array<{
        agentId: string;
        status: string;
        _sum: { amount: unknown };
      }>) {
        const details = agentMap.get(group.agentId) ?? { name: '', email: '' };
        const current = agentStatsMap.get(group.agentId) ?? { ...details, earned: 0, pending: 0 };

        if (group.status === 'COMPLETED') {
          current.earned += Number(group._sum.amount || 0);
        } else if (group.status === 'PENDING') {
          current.pending += Number(group._sum.amount || 0);
        }

        agentStatsMap.set(group.agentId, current);
      }

      const agentStats = Array.from(agentStatsMap.entries()).map(([agentId, data]) => ({
        agentId,
        ...data,
      }));

      return {
        totalEarned: completed.sum,
        totalPending: pending.sum,
        totalCancelled: cancelled.sum,
        completedCount: completed.count,
        pendingCount: pending.count,
        agentStats,
      };
    } else {
      // Agent-specific statistics: one grouped query replaces two aggregate and
      // two count round-trips.
      const statusGroups = await (this.prisma.commission as any).groupBy({
        by: ['status'],
        where: { agentId: user.sub },
        _sum: { amount: true },
        _count: { _all: true },
      });

      const totals = new Map<string, { sum: number; count: number }>();
      for (const group of statusGroups as Array<{
        status: string;
        _sum: { amount: unknown };
        _count: { _all: number };
      }>) {
        totals.set(group.status, {
          sum: Number(group._sum.amount || 0),
          count: group._count._all,
        });
      }

      const completed = totals.get('COMPLETED') ?? { sum: 0, count: 0 };
      const pending = totals.get('PENDING') ?? { sum: 0, count: 0 };

      return {
        earned: completed.sum,
        pending: pending.sum,
        completedCount: completed.count,
        pendingCount: pending.count,
      };
    }
  }
}
