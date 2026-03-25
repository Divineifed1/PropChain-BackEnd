import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileValidationService } from '../services/file-validation.service';
import { MalwareScannerService } from '../services/malware-scanner.service';

export interface SecureFileUploadConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  maxFiles: number;
  scanForMalware: boolean;
  validateMagicNumbers: boolean;
}

/**
 * Custom file validator for secure file uploads
 * Integrates with FileValidationService and MalwareScannerService
 */
@Injectable()
export class SecureFileValidator {
  constructor(
    private configService: ConfigService,
    private fileValidationService: FileValidationService,
    private malwareScannerService: MalwareScannerService,
  ) {}

  /**
   * Validate uploaded file with comprehensive security checks
   */
  async validate(file: Express.Multer.File): Promise<void> {
    const config = this.getUploadConfig();

    // 1. Check file size
    if (file.size > config.maxFileSize) {
      throw new BadRequestException(
        `File size (${this.formatBytes(file.size)}) exceeds maximum allowed size (${this.formatBytes(config.maxFileSize)})`,
      );
    }

    // 2. Validate filename
    this.fileValidationService.validateFilename(file.originalname);

    // 3. Validate file type using magic numbers (if enabled)
    if (config.validateMagicNumbers) {
      const validationResult = this.fileValidationService.validateFile(file.buffer, file.mimetype);

      if (!validationResult.isValid) {
        throw new BadRequestException(
          `File validation failed: ${validationResult.errors?.join(', ') || 'Unknown file type'}`,
        );
      }

      // Check if detected MIME type is allowed
      if (
        validationResult.fileType &&
        !this.fileValidationService.isMimeTypeAllowed(validationResult.fileType.mime, config.allowedMimeTypes)
      ) {
        throw new BadRequestException(`File type '${validationResult.fileType.mime}' is not allowed`);
      }
    } else {
      // Fallback to basic MIME type check
      if (!config.allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `File type '${file.mimetype}' is not allowed. Allowed types: ${config.allowedMimeTypes.join(', ')}`,
        );
      }
    }

    // 4. Scan for malware (if enabled)
    if (config.scanForMalware) {
      const scanResult = await this.malwareScannerService.scanFile(file.buffer, file.originalname);

      if (!scanResult.isClean) {
        throw new BadRequestException(
          `Security alert: File contains malware - ${scanResult.virusName || 'Unknown virus'}`,
        );
      }
    }
  }

  /**
   * Get upload configuration from environment
   */
  getUploadConfig(): SecureFileUploadConfig {
    return {
      maxFileSize: this.configService.get<number>('MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB default
      allowedMimeTypes: this.configService
        .get<string>('ALLOWED_FILE_TYPES', 'image/jpeg,image/png,application/pdf')
        .split(','),
      maxFiles: this.configService.get<number>('MAX_FILES_PER_UPLOAD', 10),
      scanForMalware: this.configService.get<boolean>('MALWARE_SCANNING_ENABLED', true),
      validateMagicNumbers: this.configService.get<boolean>('VALIDATE_MAGIC_NUMBERS', true),
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  }
}
