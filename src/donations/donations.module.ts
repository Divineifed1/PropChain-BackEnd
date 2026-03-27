import { Module } from '@nestjs/common';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { PrismaModule } from '../database/prisma/prisma.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { EventEmitter } from 'events';

@Module({
  imports: [PrismaModule, BlockchainModule],
  controllers: [DonationsController],
  providers: [
    DonationsService,
    {
      provide: 'DONATION_EVENTS',
      useValue: new EventEmitter(),
    },
  ],
  exports: [DonationsService],
})
export class DonationsModule {}
