import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROPERTY_STATUS_ENUM } from '../../common/common.types';

/**
 * Body for `PATCH /properties/:id/status`.
 * `status` must be a valid PropertyStatus value; the service verifies that
 * the transition from the current status to this one is allowed by the workflow.
 */
export class TransitionPropertyStatusDto {
  @ApiProperty({
    enum: PROPERTY_STATUS_ENUM,
    description: 'The status to move the listing to.',
    example: 'ACTIVE',
  })
  @IsIn(PROPERTY_STATUS_ENUM)
  status: (typeof PROPERTY_STATUS_ENUM)[number];

  /** Optional note explaining the transition (e.g., "buyer signed contract"). */
  @ApiPropertyOptional({ maxLength: 500, description: 'Why the status changed.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
