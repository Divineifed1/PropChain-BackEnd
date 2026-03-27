import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarPayoutService } from './stellar-payout.service';
import { StellarPayoutController } from './stellar-payout.controller';

@Module({
  imports: [ConfigModule],
  controllers: [StellarPayoutController],
  providers: [StellarPayoutService],
  exports: [StellarPayoutService],
})
export class StellarPayoutModule {}