import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { StellarPayoutService } from './stellar-payout.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../auth/guards/rbac.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

/**
 * DTO for sending a payout
 */
class SendPayoutDto {
  destination: string;
  amount: string;
  withdrawalId?: string;
  memo?: string;
}

/**
 * Controller for Stellar payout operations
 * Provides endpoints for platform-wide payouts to creators
 */
@ApiTags('stellar-payout')
@ApiBearerAuth()
@Controller('stellar')
@UseGuards(JwtAuthGuard)
export class StellarPayoutController {
  private readonly logger = new Logger(StellarPayoutController.name);

  constructor(private readonly stellarPayoutService: StellarPayoutService) {}

  /**
   * Get platform account info
   * Accessible by admin only
   */
  @Get('account')
  @UseGuards(RbacGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get platform Stellar account info' })
  async getAccountInfo() {
    return this.stellarPayoutService.getPlatformAccountInfo();
  }

  /**
   * Check if Stellar service is ready
   */
  @Get('status')
  @ApiOperation({ summary: 'Check Stellar service status' })
  async getStatus() {
    return {
      ready: this.stellarPayoutService.isReady(),
    };
  }

  /**
   * Preview a transaction without submitting
   */
  @Post('preview')
  @UseGuards(RbacGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Preview payment transaction' })
  async previewTransaction(@Body() dto: SendPayoutDto) {
    return this.stellarPayoutService.buildTransaction(
      dto.destination,
      dto.amount,
      dto.memo,
    );
  }

  /**
   * Submit a payment transaction
   * Accessible by admin only
   */
  @Post('payout')
  @UseGuards(RbacGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Send payment to creator via Stellar' })
  async sendPayout(@Body() dto: SendPayoutDto) {
    return this.stellarPayoutService.sendPayment(
      dto.destination,
      dto.amount,
      dto.memo,
    );
  }

  /**
   * Get transaction status
   */
  @Get('transaction/:hash')
  @UseGuards(RbacGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get transaction status from Stellar' })
  async getTransactionStatus(@Param('hash') hash: string) {
    return this.stellarPayoutService.getTransactionStatus(hash);
  }

  /**
   * Validate a Stellar address
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate a Stellar address' })
  async validateAddress(@Body() body: { address: string }) {
    return {
      valid: this.stellarPayoutService.validateStellarAddress(body.address),
      address: body.address,
    };
  }
}