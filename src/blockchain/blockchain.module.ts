import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { StellarPayoutModule } from './stellar/stellar-payout.module';

@Module({
  imports: [StellarPayoutModule],
  providers: [BlockchainService],
  exports: [BlockchainService, StellarPayoutModule],
})
export class BlockchainModule {}
