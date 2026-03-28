import { SetMetadata } from '@nestjs/common';
import { DuplicateProtectionOptions } from '../guards/duplicate-protection.guard';

export const DUPLICATE_PROTECTION_KEY = 'duplicateProtection';

/**
 * Decorator to mark a route as protected against duplicate entries
 */
export const DuplicateProtection = (options: DuplicateProtectionOptions) => 
  SetMetadata(DUPLICATE_PROTECTION_KEY, options);
