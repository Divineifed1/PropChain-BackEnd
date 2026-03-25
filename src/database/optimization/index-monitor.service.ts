import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PerformanceMonitorService } from './performance.monitor';

type PgIndexUsageRow = {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: bigint | number;
};

type PgTableStatsRow = {
  schemaname: string;
  relname: string;
  n_deadlocks: bigint | number;
};

@Injectable()
export class IndexMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(IndexMonitorService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly performanceMonitor: PerformanceMonitorService,
    private readonly configService: ConfigService,
  ) {
    const enabled = this.configService.get<boolean>('INDEX_MONITORING_ENABLED', true);
    if (enabled) {
      this.start();
    }
  }

  private start() {
    const intervalMs = this.configService.get<number>('INDEX_MONITORING_INTERVAL_MS', 60_000);
    this.interval = setInterval(() => {
      void this.collectOnce();
    }, intervalMs);

    // Run one initial collection quickly (but async)
    void this.collectOnce();
    this.logger.log(`Index monitoring started with ${intervalMs}ms interval`);
  }

  async onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collectOnce(): Promise<void> {
    try {
      const [indexUsage, tableStats] = await Promise.all([this.getIndexUsage(), this.getTableStats()]);

      for (const row of indexUsage) {
        const qualifiedIndex = `${row.schemaname}.${row.indexname}`;
        const usageCount = typeof row.idx_scan === 'bigint' ? Number(row.idx_scan) : row.idx_scan;
        this.performanceMonitor.updateIndexUsage(qualifiedIndex, usageCount);
      }

      for (const row of tableStats) {
        const qualifiedTable = `${row.schemaname}.${row.relname}`;
        const deadlocks = typeof row.n_deadlocks === 'bigint' ? Number(row.n_deadlocks) : row.n_deadlocks;
        this.performanceMonitor.updateTableStats(qualifiedTable, {
          avgRowLockTime: 0,
          deadlockCount: deadlocks,
          avgQueryTime: 0,
          indexUsageStats: new Map(),
        });
      }
    } catch (error) {
      this.logger.warn(`Index monitoring collection failed: ${(error as Error)?.message ?? String(error)}`);
    }
  }

  private async getIndexUsage(): Promise<PgIndexUsageRow[]> {
    // pg_stat_user_indexes is safe for regular roles in most managed Postgres setups.
    return this.prisma.$queryRaw<PgIndexUsageRow[]>`
      SELECT
        schemaname,
        relname AS tablename,
        indexrelname AS indexname,
        idx_scan
      FROM pg_stat_user_indexes
      ORDER BY idx_scan ASC;
    `;
  }

  private async getTableStats(): Promise<PgTableStatsRow[]> {
    return this.prisma.$queryRaw<PgTableStatsRow[]>`
      SELECT
        schemaname,
        relname,
        n_deadlocks
      FROM pg_stat_user_tables;
    `;
  }
}
