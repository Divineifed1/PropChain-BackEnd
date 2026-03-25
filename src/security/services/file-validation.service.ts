import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface FileTypeMatch {
  ext: string;
  mime: string;
}

export interface FileValidationResult {
  isValid: boolean;
  fileType?: FileTypeMatch;
  checksum?: string;
  errors?: string[];
}

/**
 * Comprehensive file validation service using magic number detection
 * Prevents MIME type spoofing attacks by validating actual file content
 */
@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  // Magic numbers for common file types (first bytes of files)
  private readonly magicNumberSignatures: Record<
    string,
    { offset: number; bytes: string; mime: string; ext: string }[]
  > = {
    image: [
      { offset: 0, bytes: 'FFD8FF', mime: 'image/jpeg', ext: 'jpg' },
      { offset: 0, bytes: '89504E470D0A1A0A', mime: 'image/png', ext: 'png' },
      { offset: 0, bytes: '474946383761', mime: 'image/gif', ext: 'gif' },
      { offset: 0, bytes: '474946383961', mime: 'image/gif', ext: 'gif' },
      { offset: 0, bytes: '52494646', mime: 'image/webp', ext: 'webp' }, // RIFF....WEBP
      { offset: 8, bytes: '57454250', mime: 'image/webp', ext: 'webp' }, // WEBP at offset 8
      { offset: 0, bytes: '0000000C6A502020', mime: 'image/jp2', ext: 'jp2' },
      { offset: 0, bytes: '424D', mime: 'image/bmp', ext: 'bmp' },
      { offset: 0, bytes: '00000100', mime: 'image/x-icon', ext: 'ico' },
    ],
    document: [
      { offset: 0, bytes: '255044462D', mime: 'application/pdf', ext: 'pdf' }, // %PDF-
      { offset: 0, bytes: 'D0CF11E0A1B11AE1', mime: 'application/msword', ext: 'doc' },
      {
        offset: 0,
        bytes: '504B0304',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
      },
      { offset: 0, bytes: '504B0304', mime: 'application/vnd.ms-excel', ext: 'xls' },
      {
        offset: 0,
        bytes: '504B0304',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: 'xlsx',
      },
      { offset: 0, bytes: '504B0304', mime: 'application/vnd.ms-powerpoint', ext: 'ppt' },
      {
        offset: 0,
        bytes: '504B0304',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ext: 'pptx',
      },
    ],
    archive: [
      { offset: 0, bytes: '504B0304', mime: 'application/zip', ext: 'zip' },
      { offset: 0, bytes: '1F8B08', mime: 'application/gzip', ext: 'gz' },
      { offset: 0, bytes: 'FD377A585A00', mime: 'application/x-xz', ext: 'xz' },
      { offset: 0, bytes: '7A627879', mime: 'application/x-bzip2', ext: 'bz2' },
      { offset: 0, bytes: '52617221', mime: 'application/vnd.rar', ext: 'rar' },
      { offset: 0, bytes: '377ABCAF271C', mime: 'application/x-7z-compressed', ext: '7z' },
    ],
    video: [
      { offset: 0, bytes: '000000186674797069736F6D', mime: 'video/mp4', ext: 'mp4' },
      { offset: 0, bytes: '0000001C6674797069736F6D', mime: 'video/mp4', ext: 'mp4' },
      { offset: 4, bytes: '6674797069736F6D', mime: 'video/mp4', ext: 'mp4' },
      { offset: 0, bytes: '1A45DFA3', mime: 'video/webm', ext: 'webm' },
      { offset: 0, bytes: '0000002066747970', mime: 'video/quicktime', ext: 'mov' },
    ],
    audio: [
      { offset: 0, bytes: '494433', mime: 'audio/mpeg', ext: 'mp3' }, // ID3
      { offset: 0, bytes: 'FFF', mime: 'audio/mpeg', ext: 'mp3' },
      { offset: 0, bytes: '664C6143', mime: 'audio/flac', ext: 'flac' }, // fLaC
      { offset: 0, bytes: '52494646', mime: 'audio/wav', ext: 'wav' }, // RIFF....WAVE
      { offset: 8, bytes: '57415645', mime: 'audio/wav', ext: 'wav' },
      { offset: 0, bytes: '4F676753', mime: 'audio/ogg', ext: 'ogg' }, // OggS
    ],
  };

  // Dangerous file extensions that should be blocked
  private readonly dangerousExtensions = [
    '.exe',
    '.dll',
    '.so',
    '.dylib', // Executables
    '.bat',
    '.cmd',
    '.sh',
    '.bash',
    '.ps1',
    '.vbs',
    '.js',
    '.jar', // Scripts
    '.php',
    '.asp',
    '.aspx',
    '.jsp',
    '.cgi', // Web scripts
    '.pl',
    '.py',
    '.rb',
    '.swf', // Other executables
    '.msi',
    '.com',
    '.pif',
    '.scr',
    '.reg', // Windows executables
    '.lnk',
    '.inf',
    '.drv', // System files
    '.htaccess',
    '.htpasswd', // Apache config
  ];

  /**
   * Validate a file buffer using magic number detection
   */
  validateFile(buffer: Buffer, declaredMimeType?: string): FileValidationResult {
    const errors: string[] = [];

    if (!buffer || buffer.length === 0) {
      return {
        isValid: false,
        errors: ['Empty file provided'],
      };
    }

    // Detect actual file type using magic numbers
    const detectedType = this.detectFileType(buffer);

    if (!detectedType) {
      return {
        isValid: false,
        errors: ['Unable to determine file type. File may be corrupted or unsupported.'],
      };
    }

    // Check for MIME type mismatch (potential spoofing attack)
    if (declaredMimeType && declaredMimeType !== detectedType.mime) {
      errors.push(`MIME type mismatch detected. Declared: ${declaredMimeType}, Actual: ${detectedType.mime}`);
    }

    // Calculate checksum
    const checksum = this.calculateChecksum(buffer);

    if (errors.length > 0) {
      return {
        isValid: false,
        fileType: detectedType,
        checksum,
        errors,
      };
    }

    return {
      isValid: true,
      fileType: detectedType,
      checksum,
    };
  }

  /**
   * Check if file extension is dangerous
   */
  isDangerousExtension(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();
    return this.dangerousExtensions.some(ext => lowerFilename.endsWith(ext) || lowerFilename.includes(`${ext}.`));
  }

  /**
   * Validate filename for security issues
   */
  validateFilename(filename: string): void {
    if (!filename || filename.trim().length === 0) {
      throw new BadRequestException('Invalid filename');
    }

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename: path traversal detected');
    }

    // Check for null bytes
    if (filename.includes('\0')) {
      throw new BadRequestException('Invalid filename: null byte detected');
    }

    // Check for dangerous extensions
    if (this.isDangerousExtension(filename)) {
      throw new BadRequestException(`File type not allowed: ${filename}`);
    }

    // Check filename length (max 255 characters)
    if (filename.length > 255) {
      throw new BadRequestException('Filename too long (max 255 characters)');
    }
  }

  /**
   * Detect file type using magic number signatures
   */
  private detectFileType(buffer: Buffer): FileTypeMatch | null {
    const hexHeader = buffer.toString('hex', 0, Math.min(16, buffer.length)).toUpperCase();

    // Check all signature categories
    for (const category of Object.values(this.magicNumberSignatures)) {
      for (const signature of category) {
        const startByte = signature.offset * 2; // Convert bytes to hex chars
        const endByte = startByte + signature.bytes.length;
        const fileHeader = hexHeader.substring(startByte, endByte);

        if (fileHeader.startsWith(signature.bytes)) {
          // Additional check for formats with longer signatures
          if (signature.bytes.length > 8) {
            return { ext: signature.ext, mime: signature.mime };
          }

          // For common signatures like PK (504B0304), do additional validation
          if (signature.bytes === '504B0304') {
            // ZIP-based formats - check further to distinguish
            return this.distinguishZipFormat(buffer, signature);
          }

          return { ext: signature.ext, mime: signature.mime };
        }
      }
    }

    // Fallback: check for text-based formats
    if (this.isTextFile(buffer)) {
      return { ext: 'txt', mime: 'text/plain' };
    }

    return null;
  }

  /**
   * Distinguish between ZIP-based formats (docx, xlsx, pptx, zip, etc.)
   */
  private distinguishZipFormat(buffer: Buffer, baseSignature: any): FileTypeMatch {
    try {
      // Look for mimetype markers in the ZIP structure
      const content = buffer.toString('binary');

      if (content.includes('[Content_Types].xml')) {
        if (content.includes('word/')) {
          return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        }
        if (content.includes('xl/')) {
          return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
        }
        if (content.includes('ppt/')) {
          return { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
        }
      }
    } catch (error) {
      // Ignore errors, fallback to generic ZIP
    }

    return { ext: 'zip', mime: 'application/zip' };
  }

  /**
   * Check if buffer represents a text file
   */
  private isTextFile(buffer: Buffer): boolean {
    try {
      const text = buffer.toString('utf8').toLowerCase();
      // Check for common text patterns and absence of binary data
      const hasBinaryNulls = buffer.indexOf(0, 10) !== -1;
      const hasReadableContent = /[a-zA-Z0-9]/.test(text);
      return !hasBinaryNulls && hasReadableContent;
    } catch {
      return false;
    }
  }

  /**
   * Calculate SHA-256 checksum of buffer
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Get supported MIME types for a category
   */
  getSupportedMimeTypes(category: 'image' | 'document' | 'archive' | 'video' | 'audio' | 'all'): string[] {
    if (category === 'all') {
      return Object.values(this.magicNumberSignatures)
        .flat()
        .map(sig => sig.mime);
    }

    const signatures = this.magicNumberSignatures[category] || [];
    return signatures.map(sig => sig.mime);
  }

  /**
   * Validate against allowed MIME types list
   */
  isMimeTypeAllowed(mimeType: string, allowedTypes: string[]): boolean {
    if (!mimeType || !allowedTypes?.length) {
      return false;
    }

    // Exact match
    if (allowedTypes.includes(mimeType)) {
      return true;
    }

    // Wildcard match (e.g., image/*)
    const wildcardMatches = allowedTypes.some(allowed => {
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -2);
        return mimeType.startsWith(`${prefix}/`);
      }
      return false;
    });

    return wildcardMatches;
  }
}
