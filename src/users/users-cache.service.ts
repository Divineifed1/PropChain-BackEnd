import { Injectable, Optional } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { CacheOperationStatus } from '../cache/cache.types';

export const USER_STATISTICS_TTL_SECONDS = 60;

/**
 * Read-through Redis cache for expensive, read-only Users API responses.
 * Cache failures never fail a request: on any cache error, or when no cache is
 * available, the loader runs as if caching were off.
 */
@Injectable()
export class UsersCacheService {
  constructor(@Optional() private readonly cache?: CacheService) {}

  statisticsKey(userId: string): string {
    return `users:statistics:${userId}`;
  }

  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    if (!this.cache) return loader();
    try {
      const hit = await this.cache.get<T>(key);
      if (hit.status === CacheOperationStatus.SUCCESS && hit.data !== undefined)
        return hit.data as T;
    } catch {
      return loader();
    }
    const value = await loader();
    try {
      await this.cache.set(key, value, ttlSeconds);
    } catch {
      /* a failed write only means the next call recomputes */
    }
    return value;
  }

  async invalidateStatistics(userId: string): Promise<void> {
    try {
      await this.cache?.del(this.statisticsKey(userId));
    } catch {
      /* the entry expires on its own within the TTL */
    }
  }
}
