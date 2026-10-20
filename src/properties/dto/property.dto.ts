import { IsString, IsNumber, IsOptional, IsArray, IsIn, IsUrl } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InputType, Field, Float } from '@nestjs/graphql';
import { PROPERTY_STATUS_ENUM, PropertyStatusLiteral } from '../../common/common.types';
import { CleanIdentifierList, CleanText, TrimIdentifier } from '../sanitize.util';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@InputType()
export class CreatePropertyDto {
  @Field()
  @ApiProperty({ description: 'Listing headline.', example: 'Sunlit loft downtown' })
  @Transform(CleanText)
  @IsString()
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiPropertyOptional({ description: 'Full description of the listing.' })
  @Transform(CleanText)
  @IsString()
  description?: string;

  @Field()
  @ApiProperty({ description: 'Street address.' })
  @Transform(TrimIdentifier)
  @IsString()
  address: string;

  @Field()
  @ApiProperty({ description: 'City.' })
  @Transform(TrimIdentifier)
  @IsString()
  city: string;

  @Field()
  @ApiProperty({ description: 'State, province or region.' })
  @Transform(TrimIdentifier)
  @IsString()
  state: string;

  @Field()
  @ApiProperty({ description: 'Postal code.' })
  @Transform(TrimIdentifier)
  @IsString()
  zipCode: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiPropertyOptional({ description: 'Country. Defaults to USA.', example: 'USA' })
  @Transform(TrimIdentifier)
  @IsString()
  country?: string;

  @Field(() => Float)
  @IsNumber()
  @ApiProperty({ description: 'Asking price.' })
  price: number;

  @Field()
  @ApiProperty({ description: 'HOUSE, APARTMENT, CONDO, LAND, ...', example: 'APARTMENT' })
  @Transform(TrimIdentifier)
  @IsString()
  propertyType: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Number of bedrooms.' })
  bedrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Number of bathrooms. Half-baths are allowed.' })
  bathrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Interior area in square feet.' })
  squareFeet?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Lot area.' })
  lotSize?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Year the property was built.' })
  yearBuilt?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @Transform(CleanIdentifierList)
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'Amenity keywords, e.g. pool, garage.' })
  features?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @ApiPropertyOptional({ description: 'Listing category.' })
  @Transform(TrimIdentifier)
  @IsString()
  category?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @Transform(CleanIdentifierList)
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'Free-form tags for filtering.' })
  tags?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Latitude. Auto-geocoded from the address when omitted.' })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Longitude. Auto-geocoded from the address when omitted.' })
  longitude?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  @ApiProperty({ description: 'Absolute URL of a virtual tour.', format: 'uri' })
  virtualTourUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  @ApiProperty({ description: 'Absolute URL of a property video.', format: 'uri' })
  videoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiPropertyOptional({ description: 'Name of the homeowners association.' })
  @Transform(CleanText)
  @IsString()
  hoaName?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Monthly HOA fee.' })
  hoaMonthlyFee?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @Transform(CleanIdentifierList)
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'Amenities included by the HOA.' })
  hoaAmenities?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @ApiPropertyOptional({ description: 'How to reach the HOA.' })
  @Transform(CleanText)
  @IsString()
  hoaContactInfo?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @ApiProperty({
    description: 'When the listing expires (ISO 8601).',
    type: String,
    format: 'date-time',
  })
  expiryDate?: Date;
}

@InputType()
export class UpdatePropertyDto {
  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Listing headline.', example: 'Sunlit loft downtown' })
  @Transform(CleanText)
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Full description of the listing.' })
  @Transform(CleanText)
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Street address.' })
  @Transform(TrimIdentifier)
  @IsString()
  address?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'City.' })
  @Transform(TrimIdentifier)
  @IsString()
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'State, province or region.' })
  @Transform(TrimIdentifier)
  @IsString()
  state?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Postal code.' })
  @Transform(TrimIdentifier)
  @IsString()
  zipCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Country. Defaults to USA.', example: 'USA' })
  @Transform(TrimIdentifier)
  @IsString()
  country?: string;

  @Field(() => Float, { nullable: true })
  @ApiPropertyOptional({
    description: 'New asking price. A change is recorded in the price history.',
  })
  @IsOptional()
  @IsNumber()
  price?: number;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'HOUSE, APARTMENT, CONDO, LAND, ...', example: 'APARTMENT' })
  @Transform(TrimIdentifier)
  @IsString()
  propertyType?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Number of bedrooms.' })
  bedrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Number of bathrooms. Half-baths are allowed.' })
  bathrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Interior area in square feet.' })
  squareFeet?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Lot area.' })
  lotSize?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Year the property was built.' })
  yearBuilt?: number;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    enum: PROPERTY_STATUS_ENUM,
    description:
      'Lifecycle status. Prefer PATCH /properties/:id/status, which enforces the allowed workflow.',
  })
  @IsOptional()
  @IsIn(PROPERTY_STATUS_ENUM)
  status?: PropertyStatusLiteral;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @Transform(CleanIdentifierList)
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String], description: 'Amenity keywords, e.g. pool, garage.' })
  features?: string[];

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @ApiPropertyOptional({
    description: 'When the listing expires (ISO 8601).',
    type: String,
    format: 'date-time',
  })
  expiryDate?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Listing category.' })
  @Transform(TrimIdentifier)
  @IsString()
  category?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @Transform(CleanIdentifierList)
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String], description: 'Free-form tags for filtering.' })
  tags?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Latitude. Auto-geocoded from the address when omitted.' })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Longitude. Auto-geocoded from the address when omitted.' })
  longitude?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  @ApiPropertyOptional({ description: 'Absolute URL of a virtual tour.', format: 'uri' })
  virtualTourUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  @ApiPropertyOptional({ description: 'Absolute URL of a property video.', format: 'uri' })
  videoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'Name of the homeowners association.' })
  @Transform(CleanText)
  @IsString()
  hoaName?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Monthly HOA fee.' })
  hoaMonthlyFee?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @Transform(CleanIdentifierList)
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String], description: 'Amenities included by the HOA.' })
  hoaAmenities?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @ApiProperty({ description: 'How to reach the HOA.' })
  @Transform(CleanText)
  @IsString()
  hoaContactInfo?: string;
}
