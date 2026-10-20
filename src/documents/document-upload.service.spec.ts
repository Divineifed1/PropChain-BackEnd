import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DocumentUploadService, UploadRequest } from './document-upload.service';

describe('DocumentUploadService', () => {
  let service: DocumentUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentUploadService],
    }).compile();
    service = module.get<DocumentUploadService>(DocumentUploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    it('should pass for valid request', () => {
      const req: UploadRequest = {
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      };
      expect(() => service.validate(req)).not.toThrow();
    });

    it('should throw BadRequestException for unsupported mime type', () => {
      const req: UploadRequest = {
        fileName: 'test.txt',
        mimeType: 'text/plain',
        fileSizeBytes: 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('Unsupported file type: text/plain');
    });

    it('should throw BadRequestException for file exceeding size limit', () => {
      const req: UploadRequest = {
        fileName: 'large.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 30 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow(
        'File exceeds maximum allowed size of 25 MB for application/pdf',
      );
    });

    it('should throw BadRequestException for empty file name', () => {
      const req: UploadRequest = {
        fileName: '   ',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('File name cannot be empty');
    });

    it('should throw BadRequestException for zero size file', () => {
      const req: UploadRequest = {
        fileName: 'empty.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 0,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('File size must be greater than zero');
    });

    it('should enforce type-specific size limits for images', () => {
      const req: UploadRequest = {
        fileName: 'big.png',
        mimeType: 'image/png',
        fileSizeBytes: 15 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
    });

    it('should enforce type-specific size limits for docs', () => {
      const req: UploadRequest = {
        fileName: 'big.doc',
        mimeType: 'application/msword',
        fileSizeBytes: 20 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
    });
  });

  describe('prepareMetadata', () => {
    it('should sanitize filename and add uploadedAt', () => {
      const req: UploadRequest = {
        fileName: 'My File Report!.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      };
      const result = service.prepareMetadata(req);
      expect(result.fileName).toBe('My File Report!.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.fileSizeBytes).toBe(1024);
      expect(result.sanitisedName).toBe('my_file_report_.pdf');
      expect(result).toHaveProperty('uploadedAt');
    });
  });

  describe('validateMagicBytes', () => {
    it('should validate PDF magic bytes (header + trailing EOF marker)', () => {
      const pdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
        Buffer.from('1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
        Buffer.from('%%EOF'),
      ]);
      expect(service.validateMagicBytes(pdfBuffer, 'application/pdf')).toBe(true);
    });

    it('should reject a PDF whose header is valid but has no EOF trailer', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(service.validateMagicBytes(pdfBuffer, 'application/pdf')).toBe(false);
    });

    it('should reject wrong magic bytes', () => {
      const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(service.validateMagicBytes(buf, 'application/pdf')).toBe(false);
    });

    it('should validate JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(service.validateMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    it('should validate PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(service.validateMagicBytes(pngBuffer, 'image/png')).toBe(true);
    });

    it('should validate WebP magic bytes (RIFF + WEBP marker)', () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(service.validateMagicBytes(webpBuffer, 'image/webp')).toBe(true);
    });

    it('should reject a RIFF file that is not WebP (no WEBP marker)', () => {
      const wavBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      expect(service.validateMagicBytes(wavBuffer, 'image/webp')).toBe(false);
    });

    it('should validate AVIF magic bytes (ftyp box, avif brand)', () => {
      const avifBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
      ]);
      expect(service.validateMagicBytes(avifBuffer, 'image/avif')).toBe(true);
    });

    it('should validate legacy .doc magic bytes (OLE2)', () => {
      const docBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      expect(service.validateMagicBytes(docBuffer, 'application/msword')).toBe(true);
    });

    it('should validate .docx magic bytes (ZIP container)', () => {
      const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      expect(
        service.validateMagicBytes(
          docxBuffer,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe(true);
    });

    it('should return true for unknown MIME types', () => {
      const buf = Buffer.from([0x00, 0x00]);
      expect(service.validateMagicBytes(buf, 'application/octet-stream')).toBe(true);
    });

    it('should handle buffer shorter than signature', () => {
      const shortBuf = Buffer.from([0x25]);
      expect(service.validateMagicBytes(shortBuf, 'application/pdf')).toBe(false);
    });

    it('should reject empty buffers', () => {
      expect(service.validateMagicBytes(Buffer.alloc(0), 'image/jpeg')).toBe(false);
    });
  });

  describe('assertValidContent', () => {
    it('should reject a spoofed extension (jpg declared, PDF actual) with 400', () => {
      const pdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
        Buffer.from('%%EOF'),
      ]);
      expect(() => service.assertValidContent(pdfBuffer, 'image/jpeg')).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty content with 400', () => {
      expect(() => service.assertValidContent(Buffer.alloc(0), 'image/jpeg')).toThrow(
        BadRequestException,
      );
    });

    it('should reject truncated content (header only, no trailer) with 400', () => {
      const truncatedPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(() => service.assertValidContent(truncatedPdf, 'application/pdf')).toThrow(
        BadRequestException,
      );
    });

    it('should reject a polyglot file (valid header, embedded script body)', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const polyglot = Buffer.concat([jpegHeader, Buffer.from('<script>alert(1)</script>')]);
      expect(() => service.assertValidContent(polyglot, 'image/png')).toThrow(BadRequestException);
    });

    it('should accept all supported types', () => {
      const pdf = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
        Buffer.from('%%EOF'),
      ]);
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const webp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      const avif = Buffer.from([
        0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
      ]);
      const doc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

      expect(() => service.assertValidContent(pdf, 'application/pdf')).not.toThrow();
      expect(() => service.assertValidContent(jpeg, 'image/jpeg')).not.toThrow();
      expect(() => service.assertValidContent(png, 'image/png')).not.toThrow();
      expect(() => service.assertValidContent(webp, 'image/webp')).not.toThrow();
      expect(() => service.assertValidContent(avif, 'image/avif')).not.toThrow();
      expect(() => service.assertValidContent(doc, 'application/msword')).not.toThrow();
      expect(() =>
        service.assertValidContent(
          docx,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).not.toThrow();
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path traversal sequences', () => {
      expect(service.sanitizeFilename('../../../etc/passwd')).not.toContain('..');
    });

    it('should remove null bytes', () => {
      expect(service.sanitizeFilename('file\x00name.pdf')).not.toContain('\x00');
    });

    it('should remove slashes', () => {
      expect(service.sanitizeFilename('path/to/file.pdf')).not.toContain('/');
    });

    it('should replace special characters with underscores', () => {
      const result = service.sanitizeFilename('hello world!@#.pdf');
      expect(result).not.toContain(' ');
      expect(result).not.toContain('!');
    });

    it('should handle empty input with fallback', () => {
      const result = service.sanitizeFilename('...');
      expect(result).toMatch(/^upload_\d+$/);
    });

    it('should lowercase output', () => {
      expect(service.sanitizeFilename('FILE.PDF')).toBe('file.pdf');
    });
  });

  describe('validateFileSize', () => {
    it('should pass for files within limits', () => {
      const buf = Buffer.alloc(1024);
      expect(() => service.validateFileSize(buf, 'application/pdf')).not.toThrow();
    });

    it('should throw for oversized files', () => {
      const buf = Buffer.alloc(30 * 1024 * 1024);
      expect(() => service.validateFileSize(buf, 'application/pdf')).toThrow(BadRequestException);
    });
  });

  describe('scanForThreats', () => {
    it('should detect script tags', () => {
      const buf = Buffer.from('<script>alert("xss")</script>');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should detect javascript protocol', () => {
      const buf = Buffer.from('javascript:void(0)');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should detect iframe tags', () => {
      const buf = Buffer.from('<iframe src="evil.com">');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should detect object tags', () => {
      const buf = Buffer.from('<object data="evil.swf">');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should return safe for clean content', () => {
      const buf = Buffer.from('Hello world, this is a normal document.');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(true);
    });

    it('should handle binary content without false positives', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(true);
    });
  });
});
