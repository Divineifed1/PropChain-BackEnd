/**
 * CORS Origin Validator Utility
 * Validates and parses CORS origins from configuration
 */
export class CorsOriginValidator {
  /**
   * Validate and parse CORS origins from environment variable
   * Supports:
   * - '*' (wildcard - only allowed in development/test)
   * - Single origin: 'https://example.com'
   * - Multiple origins: 'https://example.com,https://api.example.com'
   *
   * @param origin - The CORS_ORIGIN environment variable value
   * @param nodeEnv - Current NODE_ENV
   * @returns Array of allowed origins or false if invalid
   */
  static validate(origin: string | undefined, nodeEnv: string): string[] | false {
    // If not set, default based on environment
    if (!origin || origin.trim() === '') {
      if (nodeEnv === 'development' || nodeEnv === 'test') {
        console.warn('[CorsOriginValidator] CORS_ORIGIN not set. Using default allow-all in development/test');
        return ['*'];
      }
      console.error('[CorsOriginValidator] CORS_ORIGIN is required in production/staging');
      return false;
    }

    const trimmedOrigin = origin.trim();

    // Handle wildcard
    if (trimmedOrigin === '*') {
      if (nodeEnv === 'production' || nodeEnv === 'staging') {
        console.error('[CorsOriginValidator] Wildcard (*) CORS origin is not allowed in production/staging');
        return false;
      }
      console.warn('[CorsOriginValidator] CORS configured to allow all origins (development/test mode)');
      return ['*'];
    }

    // Parse comma-separated origins
    const origins = trimmedOrigin.split(',').map(o => o.trim());
    const validatedOrigins: string[] = [];
    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\/]*$/;

    for (const origin of origins) {
      // Reject wildcard in list
      if (origin === '*') {
        console.error('[CorsOriginValidator] Wildcard (*) found in origin list - not allowed');
        return false;
      }

      // Check for localhost in production/staging
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        if (nodeEnv === 'production' || nodeEnv === 'staging') {
          console.error(`[CorsOriginValidator] Localhost origin "${origin}" is not allowed in production/staging`);
          return false;
        }
        validatedOrigins.push(origin);
        continue;
      }

      // Validate URL format (basic check)
      if (!urlPattern.test(origin)) {
        console.error(
          `[CorsOriginValidator] Invalid origin format: "${origin}". Expected valid URL (e.g., https://example.com)`,
        );
        return false;
      }

      validatedOrigins.push(origin);
    }

    if (validatedOrigins.length === 0) {
      console.error('[CorsOriginValidator] No valid CORS origins provided');
      return false;
    }

    console.log(`[CorsOriginValidator] CORS origins validated: ${validatedOrigins.join(', ')}`);
    return validatedOrigins;
  }

  /**
   * Parse CORS_ORIGIN string to array of origins
   * Returns array suitable for NestJS CORS configuration
   *
   * @param origin - The CORS_ORIGIN value
   * @returns Array of origins
   */
  static parseForNestJs(origin: string | undefined): string[] {
    if (!origin) {
      return ['*'];
    }

    if (origin.trim() === '*') {
      return ['*'];
    }

    return origin.split(',').map(o => o.trim());
  }

  /**
   * Check if origin is in the allowed list
   * Useful for custom CORS validation
   *
   * @param origin - The origin to check
   * @param allowedOrigins - Array of allowed origins
   * @returns true if origin is allowed
   */
  static isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
    // Wildcard allows all
    if (allowedOrigins.includes('*')) {
      return true;
    }

    // Check exact match
    if (allowedOrigins.includes(origin)) {
      return true;
    }

    // Check domain match (origin without trailing slash)
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    for (const allowed of allowedOrigins) {
      const normalizedAllowed = allowed.endsWith('/') ? allowed.slice(0, -1) : allowed;
      if (normalizedOrigin === normalizedAllowed) {
        return true;
      }
    }

    return false;
  }
}
