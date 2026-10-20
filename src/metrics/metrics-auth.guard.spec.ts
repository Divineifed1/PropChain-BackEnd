import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MetricsAuthGuard } from './metrics-auth.guard';

describe('MetricsAuthGuard', () => {
  let guard: MetricsAuthGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    guard = new MetricsAuthGuard();
    process.env = { ...originalEnv };
    delete process.env.METRICS_BEARER_TOKEN;
    delete process.env.METRICS_IP_ALLOWLIST;
    delete process.env.METRICS_PORT;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockContext = (options: {
    headers?: Record<string, string>;
    ip?: string;
    localPort?: number;
  }): ExecutionContext => {
    const request = {
      headers: options.headers || {},
      ip: options.ip || '127.0.0.1',
      socket: {
        remoteAddress: options.ip || '127.0.0.1',
        localPort: options.localPort || 3000,
      },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  describe('Default development mode', () => {
    it('should allow access when unconfigured in development', () => {
      const context = createMockContext({});
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Production enforcement', () => {
    it('should forbid access when in production without any protection configured', () => {
      process.env.NODE_ENV = 'production';
      const context = createMockContext({});
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Bearer token protection', () => {
    beforeEach(() => {
      process.env.METRICS_BEARER_TOKEN = 'secret-scrape-token';
    });

    it('should reject request without authorization header', () => {
      const context = createMockContext({});
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject request with incorrect token', () => {
      const context = createMockContext({
        headers: { authorization: 'Bearer wrong-token' },
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should accept request with valid Bearer token', () => {
      const context = createMockContext({
        headers: { authorization: 'Bearer secret-scrape-token' },
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should accept request with valid x-metrics-token header', () => {
      const context = createMockContext({
        headers: { 'x-metrics-token': 'secret-scrape-token' },
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('IP allowlist protection', () => {
    beforeEach(() => {
      process.env.METRICS_IP_ALLOWLIST = '10.0.0.1, 192.168.1.100';
    });

    it('should forbid access from unlisted IP', () => {
      const context = createMockContext({ ip: '203.0.113.5' });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow access from allowed IP', () => {
      const context = createMockContext({ ip: '10.0.0.1' });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Dedicated METRICS_PORT protection', () => {
    beforeEach(() => {
      process.env.METRICS_PORT = '9090';
    });

    it('should reject request arriving on standard port', () => {
      const context = createMockContext({ localPort: 3000 });
      expect(() => guard.canActivate(context)).toThrow(NotFoundException);
    });

    it('should accept request arriving on configured METRICS_PORT', () => {
      const context = createMockContext({ localPort: 9090 });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
