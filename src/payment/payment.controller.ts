import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';
import { sanitizeIdentifier } from './sanitize.util';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentService.create(dto);
  }

  @Get()
  findAll() {
    return this.paymentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    // The id is raw user input: strip control characters and surrounding
    // whitespace before it reaches the store.
    return this.paymentService.findOne(sanitizeIdentifier(id) as string);
  }
}
