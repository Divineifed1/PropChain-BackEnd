import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
  IsIn,
  IsObject,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CleanText, TrimIdentifier } from '../sanitize.util';
import { InputType, Field } from '@nestjs/graphql';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['email', 'sms', 'phone'])
  preferredChannel?: string;

  @IsOptional()
  @IsString()
  languagePreference?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsObject()
  contactHours?: {
    start: string;
    end: string;
  };
}

export class CreateUserDto {
  @Transform(TrimIdentifier)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @Transform(CleanText)
  @IsString()
  firstName: string;

  @Transform(CleanText)
  @IsString()
  lastName: string;

  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsIn(['email', 'sms', 'phone'])
  preferredChannel?: string;

  @IsOptional()
  @IsString()
  languagePreference?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsObject()
  contactHours?: {
    start: string;
    end: string;
  };

  @IsOptional()
  @IsString()
  referralCode?: string;
}

@InputType()
export class UpdateUserDto {
  @Field({ nullable: true })
  @Transform(TrimIdentifier)
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @Transform(CleanText)
  @IsOptional()
  @IsString()
  firstName?: string;

  @Field({ nullable: true })
  @Transform(CleanText)
  @IsOptional()
  @IsString()
  lastName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['email', 'sms', 'phone'])
  preferredChannel?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  languagePreference?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  timezone?: string;
}
export class SearchUsersDto {
  @Transform(CleanText)
  @IsOptional()
  @IsString()
  q?: string;

  @Transform(TrimIdentifier)
  @IsOptional()
  @IsString()
  email?: string;

  @Transform(CleanText)
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
