import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController, AdminActivityLogController } from './activity-log.controller';
import { PrismaModule } from '../database/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';

import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../auth/rate-limit.service';

import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { I18nModule } from '../i18n/i18n.module';
import { UserImportController } from './user-import.controller';
import { UserImportService } from './user-import.service';
import { UsersHealthController } from './users-health.controller';
import { UsersHealthIndicator } from './users-health.indicator';

@Module({
  imports: [PrismaModule, SessionsModule, I18nModule],
  controllers: [
    // Before UsersController: `GET /users/health` must not match `GET /users/:id`.
    UsersHealthController,
    UsersController,
    UserPreferencesController,
    ActivityLogController,
    AdminActivityLogController,
    EmailVerificationController,
    UserImportController,
  ],
  providers: [
    UsersService,
    UsersHealthIndicator,
    UserPreferencesService,
    ActivityLogService,
    EmailVerificationService,
    EmailService,
    RateLimitService,
    AccountDeletionService,
    DataExportService,
    UserImportService,
  ],
  exports: [
    UsersService,
    UserPreferencesService,
    ActivityLogService,
    EmailVerificationService,
    AccountDeletionService,
    DataExportService,
  ],
})
export class UsersModule {}
