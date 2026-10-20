import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PrismaModule } from '../database/prisma.module';
import { DashboardTraceInterceptor } from './interceptors/dashboard-trace.interceptor';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardTraceInterceptor],
})
export class DashboardModule {}
