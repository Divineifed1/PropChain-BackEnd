import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { MultichannelService } from '../communication/multichannel/multichannel.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { UpdateWithdrawalStatusDto, WithdrawalStatus } from './dto/update-withdrawal-status.dto';
import { GetWithdrawalsDto } from './dto/get-withdrawals.dto';

const statusTransitions: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  PENDING: [WithdrawalStatus.APPROVED, WithdrawalStatus.REJECTED],
  APPROVED: [WithdrawalStatus.PAID],
  REJECTED: [],
  PAID: [],
};

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly multichannelService: MultichannelService,
  ) {}

  async createWithdrawal(dto: CreateWithdrawalDto) {
    const project = await (this.prisma as any).property.findUnique({ where: { id: dto.projectId } });
    if (!project) {
      throw new NotFoundException(`Project not found: ${dto.projectId}`);
    }

    return (this.prisma as any).withdrawal.create({
      data: {
        projectId: dto.projectId,
        amount: dto.amount as any,
        transactionHash: dto.transactionHash,
        status: WithdrawalStatus.PENDING,
      },
    });
  }

  async requestWithdrawal(user: any, dto: CreateWithdrawalDto) {
    if (user.role !== 'CREATOR') {
      throw new ForbiddenException('Only creators may request withdrawals');
    }

    const project = await (this.prisma as any).property.findUnique({ where: { id: dto.projectId } });
    if (!project) {
      throw new NotFoundException(`Project not found: ${dto.projectId}`);
    }

    if (project.ownerId !== user.id) {
      throw new ForbiddenException('User does not own selected project');
    }

    // Must be completed project status to request withdrawal
    if (project.status !== 'SOLD' && project.status !== 'COMPLETED') {
      throw new BadRequestException('Withdrawals may only be requested for completed projects');
    }

    const donationSum = await (this.prisma as any).donation.aggregate({
      where: { projectId: dto.projectId, status: 'CONFIRMED' },
      _sum: { amount: true },
    });

    const approvedWithdrawalSum = await (this.prisma as any).withdrawal.aggregate({
      where: { projectId: dto.projectId, status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
      _sum: { amount: true },
    });

    const totalRaised = Number(donationSum._sum.amount || 0);
    const totalRequested = Number(approvedWithdrawalSum._sum.amount || 0);
    const availableBalance = totalRaised - totalRequested;

    if (dto.amount > availableBalance) {
      throw new BadRequestException('Requested amount exceeds available funds');
    }

    const withdrawal = await (this.prisma as any).withdrawal.create({
      data: {
        projectId: dto.projectId,
        amount: dto.amount as any,
        status: WithdrawalStatus.PENDING,
      },
    });

    const admins = await (this.prisma as any).user.findMany({ where: { role: 'ADMIN' } });
    const message = {
      title: 'New withdrawal request',
      message: `Project ${project.title || project.id} has a new withdrawal request for ${dto.amount}`,
      type: 'info',
      priority: 'high',
      data: { withdrawalId: withdrawal.id, projectId: dto.projectId },
    };

    await Promise.all(
      admins.map(admin =>
        this.multichannelService.sendInAppNotification(admin.id, {
          ...message,
          title: `Withdrawal request from ${user.name || user.id}`,
          userId: admin.id,
        }),
      ),
    );

    return withdrawal;
  }

  /**
   * Get withdrawal history for a creator, filtered by their projects
   * Includes project details
   */
  async getCreatorWithdrawals(
    user: any,
    query: GetWithdrawalsDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    if (user.role !== 'CREATOR') {
      throw new ForbiddenException('Only creators can view their withdrawal history');
    }

    // Get all projects owned by this creator
    const userProjects = await (this.prisma as any).property.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });

    const projectIds = userProjects.map((p: any) => p.id);

    if (projectIds.length === 0) {
      return {
        data: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Filter by creator's projects
    const where: any = {
      projectId: { in: projectIds },
    };

    // Also filter by specific project if provided
    if (query.projectId) {
      where.projectId = query.projectId;
    }

    const withdrawals = await (this.prisma as any).withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            location: true,
            status: true,
            ownerId: true,
          },
        },
      },
    });

    const total = await (this.prisma as any).withdrawal.count({ where });

    return {
      data: withdrawals,
      total,
      page,
      limit,
    };
  }

  async getWithdrawals(query: { scope?: string; projectId?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: any = {};

    if (query.scope === 'project' || (query.projectId && !query.scope)) {
      if (!query.projectId) {
        throw new BadRequestException('projectId is required for project scope');
      }
      where.projectId = query.projectId;
    }

    const withdrawals = await (this.prisma as any).withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await (this.prisma as any).withdrawal.count({ where });

    return {
      data: withdrawals,
      total,
      page,
      limit,
    };
  }

  /**
   * Get a withdrawal by ID with project details
   */
  async getWithdrawalById(withdrawalId: string) {
    const withdrawal = await (this.prisma as any).withdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            location: true,
            status: true,
            ownerId: true,
          },
        },
      },
    });

    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal not found: ${withdrawalId}`);
    }

    return withdrawal;
  }

  /**
   * Admin: Approve a withdrawal
   * Validates withdrawal is in PENDING status
   * Triggers Stellar payment
   */
  async approveWithdrawal(withdrawalId: string) {
    const withdrawal = await (this.prisma as any).withdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            ownerId: true,
          },
        },
      },
    });

    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal not found: ${withdrawalId}`);
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve withdrawal. Current status: ${withdrawal.status}. Only PENDING withdrawals can be approved.`,
      );
    }

    // Get the creator's Stellar address (we would need to store this in the user or project)
    // For now, we'll check if we have a destination address stored
    // This is a placeholder - in production, you'd get this from user profile
    const owner = await (this.prisma as any).user.findUnique({
      where: { id: withdrawal.project?.ownerId },
      select: { stellarAddress: true },
    });

    // Update status to APPROVED first (we'll process payment separately)
    const updatedWithdrawal = await (this.prisma as any).withdrawal.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.APPROVED },
    });

    // Notify the creator
    await this.multichannelService.sendInAppNotification(withdrawal.project?.ownerId, {
      title: 'Withdrawal Approved',
      message: `Your withdrawal request of ${withdrawal.amount} has been approved and will be processed shortly.`,
      type: 'success',
      priority: 'high',
      userId: withdrawal.project?.ownerId,
    });

    return {
      ...updatedWithdrawal,
      message: 'Withdrawal approved. Payment will be processed via Stellar.',
    };
  }

  /**
   * Admin: Reject a withdrawal
   * Validates withdrawal is in PENDING status
   */
  async rejectWithdrawal(withdrawalId: string, reason?: string) {
    const withdrawal = await (this.prisma as any).withdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        project: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal not found: ${withdrawalId}`);
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject withdrawal. Current status: ${withdrawal.status}. Only PENDING withdrawals can be rejected.`,
      );
    }

    const updatedWithdrawal = await (this.prisma as any).withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.REJECTED,
        // Could add rejectionReason field in future
      },
    });

    // Notify the creator
    await this.multichannelService.sendInAppNotification(withdrawal.project?.ownerId, {
      title: 'Withdrawal Rejected',
      message: reason
        ? `Your withdrawal request has been rejected. Reason: ${reason}`
        : 'Your withdrawal request has been rejected.',
      type: 'error',
      priority: 'high',
      userId: withdrawal.project?.ownerId,
    });

    return updatedWithdrawal;
  }

  async updateWithdrawalStatus(withdrawalId: string, dto: UpdateWithdrawalStatusDto) {
    const existing = await (this.prisma as any).withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!existing) {
      throw new NotFoundException(`Withdrawal not found: ${withdrawalId}`);
    }

    if (existing.status === dto.status) {
      return existing;
    }

    const allowed = statusTransitions[existing.status as WithdrawalStatus];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Invalid status transition from ${existing.status} to ${dto.status}`);
    }

    return (this.prisma as any).withdrawal.update({
      where: { id: withdrawalId },
      data: { status: dto.status },
    });
  }
}
