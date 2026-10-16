import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface UsersHealthResult {
  status: 'up' | 'down';
  checkedAt: string;
  checks: { database: { status: 'up' | 'down'; latencyMs: number } };
}

const DB_CHECK_TIMEOUT_MS = 2_000;

/**
 * Health of what the Users API cannot work without: a database that can read the
 * `users` table. Failure details are never returned, so a probe cannot leak
 * connection information.
 */
@Injectable()
export class UsersHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<UsersHealthResult> {
    const started = Date.now();
    let databaseUp = true;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.user.findFirst({ select: { id: true } }),
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
