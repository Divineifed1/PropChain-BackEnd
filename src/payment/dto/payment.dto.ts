import { IsIn, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { CleanText, TrimIdentifier } from '../sanitize.util';

export class CreatePaymentDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  // Sanitized before the IsIn check so trailing whitespace or control characters
  // cannot slip a value past (or fail) the currency allow-list.
  @Transform(TrimIdentifier)
  @IsString()
  @IsIn(['USD', 'EUR', 'GBP', 'NGN'])
  currency: string;

  // Free text: normalized, stripped of HTML/control characters and trimmed so a
  // padded or tag-wrapped reference cannot bypass the duplicate-reference check.
  @Transform(CleanText)
  @IsString()
  @MaxLength(100)
  reference: string;
}
