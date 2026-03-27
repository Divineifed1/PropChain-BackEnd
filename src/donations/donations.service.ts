import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { DonationWebhookDto } from './dto/donation-webhook.dto';
import { PrismaService } from '../database/prisma/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainService: BlockchainService,
    @Inject('DONATION_EVENTS') private readonly donationEvents: EventEmitter,
  ) {}

  private computeWebhookSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  private verifySignature(payload: any, signature: string | undefined) {
    const secret = process.env.DONATION_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error('Missing DONATION_WEBHOOK_SECRET environment variable');
      throw new Error('Webhook secret is not configured');
    }

    if (!signature) {
      this.logger.warn('Donation webhook called without signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const normalized = signature.replace(/^sha256=/, '').trim();
    const expected = this.computeWebhookSignature(payload, secret);

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const incomingBuffer = Buffer.from(normalized, 'utf8');

    if (expectedBuffer.length !== incomingBuffer.length || !crypto.timingSafeEqual(expectedBuffer, incomingBuffer)) {
      this.logger.warn('Invalid webhook signature', { expected, normalized });
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async processWebhook(payload: DonationWebhookDto, signature: string): Promise<any> {
    this.verifySignature(payload, signature);

    const donationModel = (this.prisma as any).donation;
    const existing = await donationModel.findUnique({
      where: { providerTransactionId: payload.providerTransactionId },
    });

    if (existing) {
      this.logger.log(`Duplicate donation webhook received for providerTransactionId=${payload.providerTransactionId}`);
      return { donation: existing, isDuplicate: true };
    }

    let donationStatus = 'PENDING';
    if (payload.blockchainHash) {
      const receipt = await this.blockchainService.getTransactionReceipt(payload.blockchainHash);
      if (!receipt) {
        throw new BadRequestException('Blockchain transaction not found');
      }

      if ((receipt as any).status === 1 && (receipt as any).confirmations >= 1) {
        donationStatus = 'CONFIRMED';
      } else {
        donationStatus = 'FAILED';
      }
    }

    const donation = await donationModel.create({
      data: {
        provider: payload.provider,
        providerTransactionId: payload.providerTransactionId,
        amount: payload.amount,
        currency: payload.currency,
        donorName: payload.donorName ?? null,
        donorEmail: payload.donorEmail ?? null,
        blockchainHash: payload.blockchainHash ?? null,
        status: donationStatus,
      },
    });

    this.logger.log(`Donation stored with id=${donation.id}, status=${donation.status}`);

    this.donationEvents.emit('donation.created', donation);

    return { donation, isDuplicate: false };
  }

  async getDonation(providerTransactionId: string) {
    return (this.prisma as any).donation.findUnique({ where: { providerTransactionId } });
  }
}
