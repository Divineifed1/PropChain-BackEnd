import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PerformanceMonitorService, QueryOptimizerService } from '../optimization';

@Global()
@Module({
  providers: [PrismaService, PerformanceMonitorService, QueryOptimizerService],
  exports: [PrismaService, PerformanceMonitorService, QueryOptimizerService],
})
export class PrismaModule {}
