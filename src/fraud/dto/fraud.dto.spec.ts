import { ValidationPipe } from '@nestjs/common';
import { AddFraudInvestigationNoteDto, BlockFraudUserDto, ReviewFraudAlertDto } from './fraud.dto';

describe('Fraud DTO sanitization', () => {
  // Mirrors the pipe configured in main.ts (whitelist + transform) so the
  // @Transform callbacks are exercised the same way they are in production.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const transform = (value: unknown, metatype: any): Promise<any> =>
    pipe.transform(value, { type: 'body', metatype });

  describe('ReviewFraudAlertDto', () => {
    it('trims, strips HTML and collapses whitespace in the note', async () => {
      const dto = await transform({ note: '  <b>Looks</b>   fine  ' }, ReviewFraudAlertDto);

      expect(dto.note).toBe('Looks fine');
    });

    it('strips control characters from the note', async () => {
      const dto = await transform({ note: 'Looks\u0000fine' }, ReviewFraudAlertDto);

      expect(dto.note).toBe('Looksfine');
    });
  });

  describe('AddFraudInvestigationNoteDto', () => {
    it('sanitizes the note and normalises the action identifier', async () => {
      const dto = await transform(
        { note: '  <i>Checked</i>  the account  ', action: '  REVIEWED  ' },
        AddFraudInvestigationNoteDto,
      );

      expect(dto.note).toBe('Checked the account');
      expect(dto.action).toBe('REVIEWED');
    });
  });

  describe('BlockFraudUserDto', () => {
    it('trims and strips tags from the reason', async () => {
      const dto = await transform({ reason: '  <u>Confirmed</u>  fraud  ' }, BlockFraudUserDto);

      expect(dto.reason).toBe('Confirmed fraud');
    });
  });
});
