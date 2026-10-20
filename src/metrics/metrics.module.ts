import { Module, Global } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: false, // Handled with clamped cardinality in metrics.controller.ts
      },
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsAuthGuard],
  exports: [MetricsService, MetricsAuthGuard],
})
export class MetricsModule {}
