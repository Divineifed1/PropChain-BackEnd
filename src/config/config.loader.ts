import * as Joi from 'joi';
import { ConfigEncryptionUtil } from './utils/config.encryption';
import { configValidationSchema } from './validation/config.validation';
import { EnvValidator } from './utils/env.validator';
import { EnvSanitizer } from './utils/env.sanitizer';

/**
 * Configuration loader with validation and environment-specific management
 */
export class ConfigLoader {
  /**
   * Load and validate configuration from environment variables
   * @param env Environment variables object (defaults to process.env)
   * @returns Validated configuration object
   */
  static load(env = process.env): any {
    // Sanitize environment variables first
    const sanitizedEnv = EnvSanitizer.sanitize(env);

    // Process the environment variables for encryption
    const processedEnv = this.processEncryptedValues(sanitizedEnv);

    // Validate the configuration
    const { error, value: validatedConfig } = configValidationSchema.validate(processedEnv, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown keys
      convert: true, // Convert values to appropriate types
    });

    if (error) {
      const validationErrors = error.details.map((detail: any) => detail.message);
      throw new Error(`Configuration validation failed:\n${validationErrors.join('\n')}`);
    }

    // Add helper methods to the configuration
    return {
      ...validatedConfig,
      // Helper to check environment
      isDevelopment: validatedConfig.NODE_ENV === 'development',
      isProduction: validatedConfig.NODE_ENV === 'production',
      isStaging: validatedConfig.NODE_ENV === 'staging',
      isTest: validatedConfig.NODE_ENV === 'test',

      // Helper to get environment-specific values
      getEnvValue: (key: string, defaultValue?: any) => {
        return validatedConfig[key] || defaultValue;
      },

      // Parse allowed file types from string to array
      ALLOWED_FILE_TYPES: validatedConfig.ALLOWED_FILE_TYPES?.split(',').map((type: string) => type.trim()) || [],
    };
  }

  /**
   * Process environment variables for encrypted values
   * @param env Environment variables object
   * @returns Processed environment variables with decrypted values
   */
  private static processEncryptedValues(env: any): any {
    const processedEnv = { ...env };

    // Define which environment variables should be treated as sensitive
    const sensitiveKeys = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'PRIVATE_KEY',
      'REDIS_PASSWORD',
      'SESSION_SECRET',
      'STORAGE_SIGNING_SECRET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'SMTP_PASS',
      'ZILLOW_API_KEY',
      'REDFIN_API_KEY',
      'CORE_LOGIC_API_KEY',
      'MAXMIND_LICENSE_KEY',
      'MARKET_TRENDS_API_KEY',
      'COINGECKO_API_KEY',
      'OPENSEA_API_KEY',
      'ETHERSCAN_API_KEY',
      'WEB3_STORAGE_TOKEN',
      'IPFS_PROJECT_ID',
      'IPFS_PROJECT_SECRET',
      'ETH_RPC',
      'POLYGON_RPC',
      'BSC_RPC',
    ];

    const encryptionKey = env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      console.warn('ENCRYPTION_KEY not found in environment. Values will not be decrypted.');
      return processedEnv;
    }

    if (encryptionKey.length !== 32) {
      console.warn('ENCRYPTION_KEY must be exactly 32 characters. Values will not be decrypted.');
      return processedEnv;
    }

    // Process each sensitive key
    for (const key of sensitiveKeys) {
      const value = processedEnv[key];
      if (value && ConfigEncryptionUtil.isEncrypted(value)) {
        try {
          processedEnv[key] = ConfigEncryptionUtil.decrypt(value, encryptionKey);
        } catch (error) {
          console.error(`Failed to decrypt ${key}:`, error instanceof Error ? error.message : String(error));
          throw new Error(`Failed to decrypt ${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return processedEnv;
  }

  /**
   * Get environment-specific configuration file path
   * @param env Environment name
   * @returns Path to environment-specific config file
   */
  static getEnvironmentConfigPath(env: string): string {
    const baseDir = process.cwd();
    switch (env.toLowerCase()) {
      case 'production':
        return `${baseDir}/config/production.env`;
      case 'staging':
        return `${baseDir}/config/staging.env`;
      case 'test':
        return `${baseDir}/config/test.env`;
      case 'development':
      default:
        return `${baseDir}/.env.local`;
    }
  }
}
