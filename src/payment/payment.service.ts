import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreatePaymentDto } from './dto/payment.dto';
import { sanitizeIdentifier, sanitizeText } from './sanitize.util';

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  reference: string;
  status: 'pending' | 'completed';
  createdAt: string;
}

/**
 * Minimal in-memory Payment API. The focus here is clear, explicit error
 * handling: callers get a 400 for bad input and a 404 for a missing payment
 * rather than an opaque 500.
 */
@Injectable()
export class PaymentService {
  private readonly payments = new Map<string, Payment>();

  create(dto: CreatePaymentDto): Payment {
    // Defensive guards so the service is safe to call directly (e.g. from
    // another module or a unit test) and not only behind the ValidationPipe.
    if (!dto || dto.amount === undefined || dto.amount === null) {
      throw new BadRequestException('amount is required');
    }
    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be greater than zero');
    }

    // Sanitize free-text/identifier input here as well, so a direct caller that
    // bypasses the DTO transforms cannot persist padded or tag-wrapped values.
    const currency = sanitizeIdentifier(dto.currency) as string;
    const reference = sanitizeText(dto.reference) as string;

    if (!reference) {
      throw new BadRequestException('reference is required');
    }

    const duplicate = [...this.payments.values()].find(
      (payment) => payment.reference === reference,
    );
    if (duplicate) {
      throw new BadRequestException(`payment with reference "${reference}" already exists`);
    }

    const payment: Payment = {
      id: randomUUID(),
      amount: dto.amount,
      currency,
      reference,
      status: 'completed',
      createdAt: new Date().toISOString(),
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  findOne(id: string): Payment {
    const payment = this.payments.get(id);
    if (!payment) {
      throw new NotFoundException(`payment ${id} not found`);
    }
    return payment;
  }

  findAll(): Payment[] {
    return [...this.payments.values()];
  }
}
