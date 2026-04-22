import { IsEmail, IsOptional, IsString, MinLength, IsIn, IsObject } from 'class-validator';

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
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
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

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
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
}
