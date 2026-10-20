import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePaymentDto } from './payment.dto';

describe('CreatePaymentDto sanitization', () => {
  // Mirrors the pipe configured in main.ts (whitelist + transform) so the
  // @Transform callbacks are exercised the same way they are in production.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const transform = (value: unknown): Promise<CreatePaymentDto> =>
    pipe.transform(value, { type: 'body', metatype: CreatePaymentDto });

  it('trims the reference and currency', async () => {
    const dto = await transform({
      amount: 10,
      currency: '  USD  ',
      reference: '  invoice-1  ',
    });

    expect(dto.reference).toBe('invoice-1');
    expect(dto.currency).toBe('USD');
  });

  it('strips HTML tags and control characters from the reference', async () => {
    const dto = await transform({
      amount: 10,
      currency: 'USD',
      reference: '<b>bold</b>\u0000ref',
    });

    expect(dto.reference).toBe('boldref');
  });

  it('rejects a currency outside the allow-list after sanitization', async () => {
    await expect(transform({ amount: 10, currency: '  BTC  ', reference: 'ref' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
