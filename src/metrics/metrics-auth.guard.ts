import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * MetricsAuthGuard
 *
 * Enforces access controls on the Prometheus /metrics endpoint.
 * Issue #1249 – /metrics endpoint is unauthenticated and exposed on the default port.
 *
 * Configurable mechanisms:
 *   1. METRICS_PORT: Dedicated metrics port. Rejects requests received on the default API port.
 *   2. METRICS_BEARER_TOKEN: Shared secret required in Authorization: Bearer <token> or x-metrics-token header.
 *   3. METRICS_IP_ALLOWLIST: Comma-separated list of allowed client IP addresses.
 *   4. Production safety: When in production and no mechanism is configured, access is forbidden.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Port isolation check
    const metricsPortEnv = process.env.METRICS_PORT;
    if (metricsPortEnv) {
      const configuredPort = parseInt(metricsPortEnv, 10);
      const localPort = request.socket?.localPort;
      // If the request was received on a different port than the configured METRICS_PORT
      if (localPort && localPort !== configuredPort) {
        throw new NotFoundException(
          'Metrics endpoint is only accessible on the configured METRICS_PORT',
        );
      }
    }

    // 2. IP allowlist check
    const allowlistEnv = process.env.METRICS_IP_ALLOWLIST;
    if (allowlistEnv) {
      const allowedIps = allowlistEnv.split(',').map((ip) => ip.trim());
      const rawIp = request.ip || request.socket?.remoteAddress || '';
      // Strip IPv6 prefix if present (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
      const clientIp = rawIp.replace(/^::ffff:/, '');

      const isAllowed = allowedIps.some((allowed) => {
        const cleanAllowed = allowed.replace(/^::ffff:/, '');
        return clientIp === cleanAllowed || rawIp === allowed;
      });

      if (!isAllowed) {
        throw new ForbiddenException(
          'Access to metrics endpoint is forbidden from this IP address',
        );
      }
    }

    // 3. Bearer token / shared secret check
    const expectedToken = process.env.METRICS_BEARER_TOKEN;
    if (expectedToken) {
      const authHeader = request.headers['authorization'];
      const xMetricsToken = request.headers['x-metrics-token'];

      let suppliedToken: string | undefined;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        suppliedToken = authHeader.substring(7).trim();
      } else if (typeof xMetricsToken === 'string') {
        suppliedToken = xMetricsToken.trim();
      }

      if (!suppliedToken || suppliedToken !== expectedToken) {
        throw new UnauthorizedException('Missing or invalid metrics authentication token');
      }
    }

    // 4. Production guard: reject if exposed in production with zero protection configured
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !metricsPortEnv && !allowlistEnv && !expectedToken) {
      throw new ForbiddenException(
        'Metrics endpoint is disabled in production without configured METRICS_BEARER_TOKEN, METRICS_IP_ALLOWLIST, or METRICS_PORT',
      );
    }

    return true;
  }
}
