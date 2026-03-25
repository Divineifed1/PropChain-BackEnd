import { Module, Global } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { IndexMonitorService } from './optimization/index-monitor.service';
import { DatabaseOptimizationController } from './optimization/database-optimization.controller';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [IndexMonitorService],
  controllers: [DatabaseOptimizationController],
  exports: [PrismaModule],
})
export class DatabaseModule {}
