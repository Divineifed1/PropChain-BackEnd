import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../rate-limit.service';
import { createSha256 } from '../security.utils';

export const AUTH_ROUTE_LIMIT_KEY = 'auth-route-limit';

export interface AuthRouteLimitOptions {
  /** Requests allowed per client per window. */
  max: number;
  windowMs: number;
}

/** Limit one unauthenticated Auth route per client address. */
export const AuthRouteLimit = (options: AuthRouteLimitOptions) =>
  SetMetadata(AUTH_ROUTE_LIMIT_KEY, options);

/**
 * Per-client rate limit for sensitive, unauthenticated Auth routes
 * (registration, token refresh, password reset, email verification).
 *
 * Each client address gets its own counter per route, so one abusive client
 * cannot lock everyone else out. The address is hashed before it reaches the
 * key store. Over the limit the response is `429` with `Retry-After`.
 */
@Injectable()
export class AuthRouteRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<AuthRouteLimitOptions | undefined>(
      AUTH_ROUTE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route = `${request.method} ${request.route?.path ?? request.url}`;
    const client = createSha256(String(request.ip ?? request.socket?.remoteAddress ?? 'unknown'));

    const status = await this.rateLimitService.checkScopedRateLimit(
      `auth-route:${route}`,
      client,
      options.max,
      options.windowMs,
    );

    if (status.isExceeded) {
      if (status.retryAfter !== undefined) response.setHeader('Retry-After', String(status.retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter: status.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
