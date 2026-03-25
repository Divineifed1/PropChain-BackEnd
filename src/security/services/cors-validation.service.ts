import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CorsOriginConfig {
  allowedOrigins: Array<string | RegExp>;
  allowCredentials: boolean;
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  maxAge?: number;
}

/**
 * CORS validation service for secure cross-origin request management
 * Provides environment-specific origin validation and dynamic origin checking
 */
@Injectable()
export class CorsValidationService {
  private readonly logger = new Logger(CorsValidationService.name);
  private readonly allowedOrigins: Set<string>;
  private readonly isProduction: boolean;
  private readonly isDevelopment: boolean;
  private readonly isTest: boolean;

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.isDevelopment = this.configService.get('NODE_ENV') === 'development';
    this.isTest = this.configService.get('NODE_ENV') === 'test';

    // Parse and validate allowed origins
    const originsConfig = this.configService.get<string>('CORS_ALLOWED_ORIGINS', '');
    this.allowedOrigins = this.parseAllowedOrigins(originsConfig);

    // Log configuration on startup
    this.logConfiguration();
  }

  /**
   * Get CORS configuration based on environment
   */
  getCorsConfig(): CorsOriginConfig {
    if (this.isProduction) {
      return this.getProductionCorsConfig();
    } else if (this.isTest) {
      return this.getTestCorsConfig();
    } else {
      return this.getDevelopmentCorsConfig();
    }
  }

  /**
   * Validate if an origin is allowed
   */
  isOriginAllowed(origin: string): boolean {
    if (!origin) {
      return false;
    }

    // In production, strictly validate against allowlist
    if (this.isProduction) {
      return this.allowedOrigins.has(origin);
    }

    // In development/test, be more permissive but still validate
    if (this.isDevelopment || this.isTest) {
      // Allow localhost variations in development
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return true;
      }

      // Also check allowlist
      return this.allowedOrigins.has(origin);
    }

    return false;
  }

  /**
   * Dynamic origin validator for NestJS CORS
   * Returns true if origin should be allowed, false otherwise
   */
  getOriginValidator(): (origin: string) => boolean {
    return (origin: string) => {
      const allowed = this.isOriginAllowed(origin);

      if (!allowed && origin) {
        this.logger.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
      }

      return allowed;
    };
  }

  /**
   * Validate CORS configuration for security issues
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Production must have explicit origins configured
    if (this.isProduction) {
      if (this.allowedOrigins.size === 0) {
        errors.push('CORS_ALLOWED_ORIGINS must be configured in production');
      }

      // Check for wildcard in production
      if (this.allowedOrigins.has('*')) {
        errors.push('Wildcard (*) CORS origin is not allowed in production');
      }

      // Validate each origin URL format
      for (const origin of this.allowedOrigins) {
        if (!this.isValidOriginUrl(origin)) {
          errors.push(`Invalid origin URL format: ${origin}`);
        }

        // Warn about insecure origins in production
        if (origin.startsWith('http://') && !origin.includes('localhost')) {
          this.logger.warn(`Insecure HTTP origin detected in production: ${origin}. Consider using HTTPS.`);
        }
      }
    }

    // Development warnings
    if (this.isDevelopment) {
      if (this.allowedOrigins.has('*')) {
        this.logger.warn(
          'CORS wildcard (*) is enabled in development. This is acceptable for local development but should be disabled in production.',
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get statistics about CORS configuration
   */
  getStats(): {
    totalOrigins: number;
    isProduction: boolean;
    isWildcard: boolean;
    hasLocalhost: boolean;
  } {
    return {
      totalOrigins: this.allowedOrigins.size,
      isProduction: this.isProduction,
      isWildcard: this.allowedOrigins.has('*'),
      hasLocalhost: Array.from(this.allowedOrigins).some(o => o.includes('localhost') || o.includes('127.0.0.1')),
    };
  }

  /**
   * Production CORS configuration - strict security
   */
  private getProductionCorsConfig(): CorsOriginConfig {
    const validation = this.validateConfig();

    if (!validation.isValid) {
      this.logger.error('Production CORS configuration is invalid:', validation.errors.join(', '), {});
      throw new BadRequestException(`Invalid CORS configuration: ${validation.errors.join(', ')}`);
    }

    return {
      allowedOrigins: Array.from(this.allowedOrigins),
      allowCredentials: this.configService.get<boolean>('CORS_CREDENTIALS_ENABLED', true),
      allowedMethods: this.configService.get<string[]>('CORS_ALLOWED_METHODS', [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS',
      ]),
      allowedHeaders: this.configService.get<string[]>('CORS_ALLOWED_HEADERS', [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'x-correlation-id',
        'Accept-Version',
      ]),
      exposedHeaders: this.configService.get<string[]>('CORS_EXPOSED_HEADERS', ['x-correlation-id', 'x-request-id']),
      maxAge: this.configService.get<number>('CORS_MAX_AGE', 86400), // 24 hours
    };
  }

  /**
   * Development CORS configuration - permissive for local testing
   */
  private getDevelopmentCorsConfig(): CorsOriginConfig {
    // If specific origins are configured, use them
    if (this.allowedOrigins.size > 0 && !this.allowedOrigins.has('*')) {
      return {
        allowedOrigins: Array.from(this.allowedOrigins),
        allowCredentials: true,
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id'],
        maxAge: 3600, // 1 hour
      };
    }

    // Otherwise, use permissive development config
    return {
      allowedOrigins: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
      allowCredentials: true,
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id'],
      maxAge: 3600,
    };
  }

  /**
   * Test CORS configuration - minimal restrictions
   */
  private getTestCorsConfig(): CorsOriginConfig {
    return {
      allowedOrigins: ['*'],
      allowCredentials: false,
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 3600,
    };
  }

  /**
   * Parse allowed origins from configuration string
   */
  private parseAllowedOrigins(originsConfig: string): Set<string> {
    const origins = new Set<string>();

    if (!originsConfig || originsConfig.trim() === '') {
      return origins;
    }

    // Split by comma and trim whitespace
    const originList = originsConfig.split(',').map(o => o.trim());

    for (const origin of originList) {
      if (origin && origin !== '*') {
        // Remove trailing slashes
        const normalizedOrigin = origin.replace(/\/$/, '');
        origins.add(normalizedOrigin);
      } else if (origin === '*' && !this.isProduction) {
        // Only allow wildcard in non-production
        origins.add('*');
      }
    }

    return origins;
  }

  /**
   * Validate origin URL format
   */
  private isValidOriginUrl(origin: string): boolean {
    try {
      const url = new URL(origin);
      // Must be http or https
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Log CORS configuration on startup
   */
  private logConfiguration(): void {
    const stats = this.getStats();

    if (this.isProduction) {
      this.logger.log(`🔒 Production CORS configured with ${stats.totalOrigins} allowed origin(s)`);
      if (stats.totalOrigins > 0) {
        this.logger.debug(`Allowed origins: ${Array.from(this.allowedOrigins).join(', ')}`);
      }
    } else if (this.isDevelopment) {
      if (stats.isWildcard) {
        this.logger.warn('⚠️  Development CORS: Wildcard (*) enabled - OK for local development');
      } else {
        this.logger.log(`🔧 Development CORS configured with ${stats.totalOrigins} allowed origin(s)`);
      }
    } else {
      this.logger.log(`🧪 Test CORS configured`);
    }
  }
}
