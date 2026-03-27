import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { UpdateWithdrawalStatusDto } from './dto/update-withdrawal-status.dto';
import { GetWithdrawalsDto } from './dto/get-withdrawals.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('withdrawals')
@ApiBearerAuth()
@Controller('withdrawals')
@UseGuards(JwtAuthGuard)
export class WithdrawalsController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
  ) {}

  /**
   * Request a new withdrawal (creators only)
   */
  @Post('request')
  @UseGuards(RbacGuard)
  @Roles('withdrawals', 'create')
  @ApiOperation({ summary: 'Request a withdrawal for a completed project' })
  async requestWithdrawal(@Request() req: any, @Body() payload: CreateWithdrawalDto) {
    return this.withdrawalsService.requestWithdrawal(req.user, payload);
  }

  /**
   * Get withdrawal history for the current user (creator)
   * Filters by the user's projects and includes project details
   */
  @Get()
  @ApiOperation({ summary: 'Get my withdrawal history (filtered by my projects)' })
  @ApiResponse({ status: 200, description: 'Returns withdrawals for creator\'s projects' })
  async getMyWithdrawals(
    @Request() req: any,
    @Query() query: GetWithdrawalsDto,
  ) {
    return this.withdrawalsService.getCreatorWithdrawals(req.user, query);
  }

  /**
   * Admin: Approve a withdrawal request
   * Validates the withdrawal is in PENDING status
   * Triggers Stellar payment to creator
   */
  @Patch(':id/approve')
  @UseGuards(RbacGuard)
  @Roles('withdrawals', 'approve')
  @ApiOperation({ summary: 'Admin: Approve a withdrawal request' })
  @ApiResponse({ status: 200, description: 'Withdrawal approved and payment initiated' })
  async approveWithdrawal(@Param('id') id: string) {
    return this.withdrawalsService.approveWithdrawal(id);
  }

  /**
   * Admin: Reject a withdrawal request
   * Validates the withdrawal is in PENDING status
   */
  @Patch(':id/reject')
  @UseGuards(RbacGuard)
  @Roles('withdrawals', 'reject')
  @ApiOperation({ summary: 'Admin: Reject a withdrawal request' })
  @ApiResponse({ status: 200, description: 'Withdrawal rejected' })
  async rejectWithdrawal(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.withdrawalsService.rejectWithdrawal(id, body.reason);
  }

  /**
   * Get a specific withdrawal by ID (admin only)
   */
  @Get(':id')
  @UseGuards(RbacGuard)
  @Roles('withdrawals', 'read')
  @ApiOperation({ summary: 'Get withdrawal by ID' })
  async getWithdrawalById(@Param('id') id: string) {
    return this.withdrawalsService.getWithdrawalById(id);
  }

  /**
   * Internal: Create a withdrawal
   */
  @Post()
  async createWithdrawal(@Body() payload: CreateWithdrawalDto) {
    return this.withdrawalsService.createWithdrawal(payload);
  }

  /**
   * Internal: Update withdrawal status
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() payload: UpdateWithdrawalStatusDto) {
    return this.withdrawalsService.updateWithdrawalStatus(id, payload);
  }
}
