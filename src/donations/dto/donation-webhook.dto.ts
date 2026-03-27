import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class DonationWebhookDto {
  @ApiProperty({ description: 'Payment provider identifier', example: 'stripe' })
  @IsString()
  provider: string;

  @ApiProperty({ description: 'Payment provider transaction ID', example: 'ch_1JH23X2eZvKYlo2C7' })
  @IsString()
  providerTransactionId: string;

  @ApiProperty({ description: 'Donation amount', example: 12.99 })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ description: 'Donor name', example: 'Alice Smith' })
  @IsOptional()
  @IsString()
  donorName?: string;

  @ApiPropertyOptional({ description: 'Donor email', example: 'alice@example.com' })
  @IsOptional()
  @IsEmail()
  donorEmail?: string;

  @ApiPropertyOptional({ description: 'Blockchain transaction hash for verification', example: '0xabc...' })
  @IsOptional()
  @IsString()
  blockchainHash?: string;

  @ApiPropertyOptional({ description: 'Optional metadata object from provider' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
