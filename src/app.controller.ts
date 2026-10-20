import { Controller, Get } from '@nestjs/common';
import { ApiVersionEnum } from './versioning/api-version.constants';
import { ApiVersion, DeprecatedEndpoint } from './versioning/api-version.decorator';
import { GetVersion } from './versioning/get-version.decorator';
import { PrismaService } from './database/prisma.service';
import { CacheService } from './cache/cache.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppLogger } from './common/logger';

/**
 * AppController
 *
 * Root-level endpoints including the comprehensive health check endpoint.
 * Issue #916 – DB health check and connection pooling diagnostics.
 * Issue #1247 – Prevent leaking connection details and driver internals in health responses.
 */
@Controller()
export class AppController {
  private readonly logger = new AppLogger(AppController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
  ) {}

  @Get()
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  getHello(): string {
    return 'Welcome to PropChain API';
  }

  /**
   * GET /health
   *
   * Comprehensive health check endpoint reporting:
   * - Database connectivity and query latency
   * - Connection pool utilisation (active / idle / pool size)
   * - Migration status (applied count)
   * - Redis connectivity
   * - Email queue depth
   */
  @Get('health')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  async health(): Promise<{
    status: string;
    timestamp: string;
    services: Record<string, unknown>;
    database: {
      connected: boolean;
      latencyMs: number;
      pool: { active: number; idle: number; poolSize: number };
      migrationsApplied: number;
    } | null;
  }> {
    const checks: Record<string, unknown> = {};
    let databaseDetails: {
      connected: boolean;
      latencyMs: number;
      pool: { active: number; idle: number; poolSize: number };
      migrationsApplied: number;
    } | null = null;

    // ── Database connectivity + pool diagnostics ──────────────────────────
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;

      // Pool metrics
      const pool = this.prisma.getPoolMetrics();

      // Migration status
      let migrationsApplied = 0;
      try {
        const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
        `;
        migrationsApplied = Number(result[0]?.count ?? 0);
      } catch {
        // _prisma_migrations may not exist in test environments
      }

      databaseDetails = {
        connected: true,
        latencyMs: dbLatency,
        pool,
        migrationsApplied,
      };

      checks.database = {
        status: 'ok',
        latencyMs: dbLatency,
        pool,
        migrationsApplied,
      };
    } catch (err: unknown) {
      this.logger.error(
        'Health check database error',
        err instanceof Error ? err.stack : String(err),
      );
      checks.database = {
        status: 'error',
        error: 'db_unreachable',
      };
    }

    // ── Redis ─────────────────────────────────────────────────────────────
    const redisStart = Date.now();
    try {
      const connected = await this.cacheService.isConnected();
      checks.redis = connected
        ? { status: 'ok', latencyMs: Date.now() - redisStart }
        : { status: 'error', error: 'redis_unreachable' };
    } catch (err: unknown) {
      this.logger.error('Health check Redis error', err instanceof Error ? err.stack : String(err));
      checks.redis = {
        status: 'error',
        error: 'redis_unreachable',
      };
    }

    // ── Email queue ───────────────────────────────────────────────────────
    const queueStart = Date.now();
    try {
      const [waiting, active, delayed] = await Promise.all([
        this.mailQueue.getWaitingCount(),
        this.mailQueue.getActiveCount(),
        this.mailQueue.getDelayedCount(),
      ]);
      checks.emailQueue = {
        status: 'ok',
        latencyMs: Date.now() - queueStart,
        waiting,
        active,
        delayed,
      };
    } catch (err: unknown) {
      this.logger.error(
        'Health check email queue error',
        err instanceof Error ? err.stack : String(err),
      );
      checks.emailQueue = {
        status: 'error',
        error: 'email_queue_unreachable',
      };
    }

    const allOk = Object.values(checks).every((c) => (c as { status: string }).status === 'ok');

    return {
      status: allOk ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: checks,
      database: databaseDetails,
    };
  }

  @Get('version')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  getVersionInfo(@GetVersion() version: ApiVersionEnum): {
    currentVersion: ApiVersionEnum;
    supportedVersions: ApiVersionEnum[];
    defaultVersion: ApiVersionEnum;
  } {
    return {
      currentVersion: version,
      supportedVersions: [ApiVersionEnum.V1, ApiVersionEnum.V2],
      defaultVersion: ApiVersionEnum.V2,
    };
  }

  @Get('deprecated-endpoint')
  @DeprecatedEndpoint('This endpoint has been deprecated. Please use /api/v2/new-endpoint instead.')
  deprecatedEndpoint(): { message: string } {
    return {
      message: 'This endpoint is deprecated and will be removed in a future version',
    };
  }
}
