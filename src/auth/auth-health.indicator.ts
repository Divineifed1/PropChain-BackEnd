import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface AuthHealthResult {
  status: 'up' | 'down';
  checkedAt: string;
  checks: { database: { status: 'up' | 'down'; latencyMs: number } };
}

const DB_CHECK_TIMEOUT_MS = 2_000;

/**
 * Health of the pieces the Auth API cannot work without. Only the database is
 * required today: sessions and refresh tokens live there. Failure details are
 * deliberately not returned, so a probe never leaks connection information.
 */
@Injectable()
export class AuthHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<AuthHealthResult> {
    const started = Date.now();
    let databaseUp = true;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), DB_CHECK_TIMEOUT_MS);
        }),
      ]);
    } catch {
      databaseUp = false;
    } finally {
      if (timer) clearTimeout(timer);
    }

    return {
      status: databaseUp ? 'up' : 'down',
      checkedAt: new Date().toISOString(),
      checks: { database: { status: databaseUp ? 'up' : 'down', latencyMs: Date.now() - started } },
    };
  }
}
