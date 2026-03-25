import { ConfigService } from '@nestjs/config';

/**
 * Create secure Multer configuration with strict limits
 */
export function createMulterConfig(configService: ConfigService) {
  const maxFileSize = configService.get<number>('MAX_FILE_SIZE', 10 * 1024 * 1024);
  const maxFiles = configService.get<number>('MAX_FILES_PER_UPLOAD', 10);
  const allowedMimeTypes = configService
    .get<string>('ALLOWED_FILE_TYPES', 'image/jpeg,image/png,application/pdf')
    .split(',');

  return {
    // File size limits
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
      // Additional limits for security
      fieldNameSize: 100, // Max field name length
      headerPairs: 2000, // Max number of header pairs
    },

    // File filter for basic MIME type checking
    fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        const error = new Error(`File type ${file.mimetype} not allowed`);
        (error as any).code = 'UNSUPPORTED_MEDIA_TYPE';
        return cb(error, false);
      }

      // Validate filename
      if (!file.originalname || file.originalname.length === 0) {
        const error = new Error('Invalid filename');
        (error as any).code = 'INVALID_FILENAME';
        return cb(error, false);
      }

      // Check for dangerous extensions
      const dangerousExtensions = [
        '.exe',
        '.dll',
        '.so',
        '.bat',
        '.cmd',
        '.sh',
        '.php',
        '.asp',
        '.aspx',
        '.jsp',
        '.cgi',
        '.pl',
        '.py',
        '.rb',
        '.msi',
        '.com',
        '.pif',
      ];

      const lowerName = file.originalname.toLowerCase();
      if (dangerousExtensions.some(ext => lowerName.endsWith(ext))) {
        const error = new Error('Dangerous file type detected');
        (error as any).code = 'DANGEROUS_FILE_TYPE';
        return cb(error, false);
      }

      cb(null, true);
    },
  };
}

/**
 * Multer options for single file upload
 */
export function getSingleFileUploadOptions(configService: ConfigService) {
  return {
    ...createMulterConfig(configService),
    preservePath: false, // Security: don't preserve original path
  };
}

/**
 * Multer options for multiple file upload
 */
export function getMultipleFileUploadOptions(configService: ConfigService) {
  return {
    ...createMulterConfig(configService),
    preservePath: false,
  };
}
