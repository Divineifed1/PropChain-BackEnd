import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAmenityDto {
  @ApiProperty({ description: 'Display name of the amenity.', example: 'Rooftop pool' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Grouping used for filtering, e.g. OUTDOOR, APPLIANCE.',
    example: 'OUTDOOR',
  })
  @IsString()
  amenityType: string;

  @ApiPropertyOptional({ description: 'Free-text detail.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true, description: 'Whether the amenity is currently offered.' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateAmenityDto {
  @ApiPropertyOptional({ description: 'Display name of the amenity.', example: 'Rooftop pool' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Grouping used for filtering.', example: 'OUTDOOR' })
  @IsOptional()
  @IsString()
  amenityType?: string;

  @ApiPropertyOptional({ description: 'Free-text detail.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the amenity is currently offered.' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
