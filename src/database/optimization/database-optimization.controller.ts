import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerformanceMonitorService } from './performance.monitor';
import { QueryOptimizerService } from './query.optimizer';

@ApiTags('database-optimization')
@Controller('database/optimization')
export class DatabaseOptimizationController {
  constructor(
    private readonly performanceMonitor: PerformanceMonitorService,
    private readonly queryOptimizer: QueryOptimizerService,
  ) {}

  @Get('slow-queries')
  @ApiOperation({ summary: 'List slow queries observed by the app' })
  getSlowQueries() {
    return this.queryOptimizer.getSlowQueries();
  }

  @Get('top-queries')
  @ApiOperation({ summary: 'List most frequent queries observed by the app' })
  getTopQueries() {
    return this.queryOptimizer.getMostFrequentQueries(25);
  }

  @Get('performance-report')
  @ApiOperation({ summary: 'Get current database performance report' })
  getPerformanceReport() {
    const report = this.performanceMonitor.generatePerformanceReport();
    const health = this.performanceMonitor.getHealthScore();
    return { ...report, health };
  }

  @Get('index-usage')
  @ApiOperation({ summary: 'Get current index usage snapshot (from pg_stat_user_indexes)' })
  getIndexUsage() {
    const metrics = this.performanceMonitor.getMetrics();
    return Array.from(metrics.indexUsage.entries())
      .map(([indexName, usageCount]) => ({ indexName, usageCount }))
      .sort((a, b) => a.usageCount - b.usageCount);
  }
}
