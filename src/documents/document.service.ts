import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import storageConfig, { StorageConfig } from '../config/storage.config';
import { MalwareScannerService } from '../security/services/malware-scanner.service';
import {
  DocumentAccessContext,
  DocumentAccessLevel,
  DocumentMetadata,
  DocumentMetadataInput,
  DocumentRecord,
  DocumentSearchFilters,
  DocumentStatus,
  DocumentType,
  DocumentVersion,
} from './document.model';

export const STORAGE_CONFIG = 'DOCUMENT_STORAGE_CONFIG';
export const STORAGE_PROVIDER = 'DOCUMENT_STORAGE_PROVIDER';

interface StorageUploadRequest {
  key: string;
  buffer: Buffer;
  contentType: string;
}

interface StorageUploadResult {
  storageKey: string;
  checksum: string;
  size: number;
}

interface StorageProvider {
  uploadObject(request: StorageUploadRequest): Promise<StorageUploadResult>;
  getSignedUrl(key: string, expiresInSeconds: number, method?: 'GET' | 'PUT'): string;
}

export class InMemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, StorageUploadRequest>();

  constructor(private readonly config: StorageConfig) {}

  async uploadObject(request: StorageUploadRequest): Promise<StorageUploadResult> {
    this.objects.set(request.key, request);
    return {
      storageKey: request.key,
      checksum: DocumentService.hashBuffer(request.buffer),
      size: request.buffer.length,
    };
  }

  getSignedUrl(key: string, expiresInSeconds: number, method: 'GET' | 'PUT' = 'GET'): string {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = crypto
      .createHmac('sha256', this.config.signingSecret)
      .update(`${method}:${key}:${expiresAt}`)
      .digest('hex');
    return `http://localhost/mock-storage/${encodeURIComponent(key)}?expires=${expiresAt}&signature=${signature}`;
  }

  getObject(key: string): StorageUploadRequest | undefined {
    return this.objects.get(key);
  }
}

export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);

  constructor(private readonly config: StorageConfig) {}

  async uploadObject(request: StorageUploadRequest): Promise<StorageUploadResult> {
    const url = this.getSignedUrl(request.key, this.config.signedUrlExpiresInSeconds, 'PUT');
    try {
      await axios.put(url, request.buffer, {
        headers: {
          'Content-Type': request.contentType,
        },
      });
    } catch (error) {
      this.logger.error('Failed to upload to S3', error instanceof Error ? error.stack : String(error));
      throw new BadRequestException('Failed to upload document to storage');
    }
    return {
      storageKey: request.key,
      checksum: DocumentService.hashBuffer(request.buffer),
      size: request.buffer.length,
    };
  }

  getSignedUrl(key: string, expiresInSeconds: number, method: 'GET' | 'PUT' = 'GET'): string {
    const { s3 } = this.config;
    if (!s3.accessKeyId || !s3.secretAccessKey) {
      throw new BadRequestException('S3 credentials are not configured');
    }

    const now = new Date();
    const amzDate = S3StorageProvider.toAmzDate(now);
    const dateStamp = S3StorageProvider.toDateStamp(now);
    const host = S3StorageProvider.resolveHost(s3, this.config);
    const canonicalUri = S3StorageProvider.buildCanonicalUri(s3.bucket, key, s3.forcePathStyle);
    const scope = `${dateStamp}/${s3.region}/s3/aws4_request`;
    const credential = `${s3.accessKeyId}/${scope}`;

    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    });

    const canonicalRequest = [
      method,
      canonicalUri,
      queryParams.toString(),
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, S3StorageProvider.hashHex(canonicalRequest)].join('\n');

    const signingKey = S3StorageProvider.getSignatureKey(s3.secretAccessKey, dateStamp, s3.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    queryParams.set('X-Amz-Signature', signature);
    const baseUrl = S3StorageProvider.buildBaseUrl(s3, this.config);
    return `${baseUrl}${canonicalUri}?${queryParams.toString()}`;
  }

  private static buildBaseUrl(s3: StorageConfig['s3'], config: StorageConfig): string {
    if (s3.endpoint) {
      return s3.endpoint.replace(/\/$/, '');
    }
    if (s3.forcePathStyle) {
      return `https://s3.${s3.region}.amazonaws.com`;
    }
    return `https://${s3.bucket}.s3.${s3.region}.amazonaws.com`;
  }

  private static resolveHost(s3: StorageConfig['s3'], config: StorageConfig): string {
    const baseUrl = S3StorageProvider.buildBaseUrl(s3, config);
    return new URL(baseUrl).host;
  }

  private static buildCanonicalUri(bucket: string, key: string, forcePathStyle: boolean): string {
    const encodedKey = key
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
    if (forcePathStyle) {
      return `/${bucket}/${encodedKey}`;
    }
    return `/${encodedKey}`;
  }

  private static hashHex(payload: string): string {
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  private static toAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private static toDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private static getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  }
}

@Injectable()
export class DocumentService {
  private static readonly virusSignature = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  private readonly logger = new Logger(DocumentService.name);
  private readonly documents = new Map<string, DocumentRecord>();

  constructor(
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfig = storageConfig(),
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider = new InMemoryStorageProvider(storageConfig()),
    private readonly malwareScanner?: MalwareScannerService,
  ) {}

  async uploadDocuments(
    files: Express.Multer.File[],
    metadataInput: DocumentMetadataInput,
    context: DocumentAccessContext,
  ): Promise<DocumentRecord[]> {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }
    this.assertContext(context);
    const metadata = this.normalizeMetadata(metadataInput, context);
    const results: DocumentRecord[] = [];

    for (const file of files) {
      const documentId = uuidv4();
      const version = await this.createVersion(documentId, file, context);
      const record: DocumentRecord = {
        id: documentId,
        type: metadataInput.type || DocumentType.OTHER,
        metadata,
        versions: [version],
        currentVersion: version.version,
        status: DocumentStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.documents.set(record.id, record);
      results.push(record);
    }

    return results;
  }

  async addDocumentVersion(
    documentId: string,
    file: Express.Multer.File,
    context: DocumentAccessContext,
  ): Promise<DocumentRecord> {
    this.assertContext(context);
    const document = this.getDocumentForUpdate(documentId, context);
    const version = await this.createVersion(documentId, file, context, document.currentVersion + 1);
    document.versions.push(version);
    document.currentVersion = version.version;
    document.updatedAt = new Date();
    return document;
  }

  async updateMetadata(
    documentId: string,
    input: DocumentMetadataInput,
    context: DocumentAccessContext,
  ): Promise<DocumentRecord> {
    this.assertContext(context);
    const document = this.getDocumentForUpdate(documentId, context);
    const updatedMetadata = this.normalizeMetadata(
      {
        ...document.metadata,
        ...input,
      },
      context,
      true,
    );
    document.metadata = updatedMetadata;
    if (input.type) {
      document.type = input.type;
    }
    document.updatedAt = new Date();
    return document;
  }

  getDocument(documentId: string, context: DocumentAccessContext): DocumentRecord {
    this.assertContext(context);
    const document = this.documents.get(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    this.ensureReadAccess(document, context);
    return document;
  }

  listDocuments(filters: DocumentSearchFilters, context: DocumentAccessContext): DocumentRecord[] {
    this.assertContext(context);
    const filterText = filters.search?.toLowerCase();
    const tag = filters.tag?.toLowerCase();
    const results: DocumentRecord[] = [];

    for (const document of this.documents.values()) {
      if (!this.hasReadAccess(document, context)) {
        continue;
      }
      if (filters.propertyId && document.metadata.propertyId !== filters.propertyId) {
        continue;
      }
      if (filters.type && document.type !== filters.type) {
        continue;
      }
      if (filters.accessLevel && document.metadata.accessLevel !== filters.accessLevel) {
        continue;
      }
      if (filters.uploadedBy && document.metadata.uploadedBy !== filters.uploadedBy) {
        continue;
      }
      if (filters.mimeType) {
        const currentVersion = this.getCurrentVersion(document);
        if (currentVersion.mimeType !== filters.mimeType) {
          continue;
        }
      }
      if (filters.createdAfter && document.createdAt < filters.createdAfter) {
        continue;
      }
      if (filters.createdBefore && document.createdAt > filters.createdBefore) {
        continue;
      }
      if (tag && !document.metadata.tags.some(documentTag => documentTag.toLowerCase() === tag)) {
        continue;
      }
      if (filterText) {
        const combined = [
          document.metadata.title,
          document.metadata.description || '',
          document.metadata.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!combined.includes(filterText)) {
          continue;
        }
      }
      results.push(document);
    }

    return results;
  }

  async getDownloadUrl(
    documentId: string,
    versionNumber: number | undefined,
    context: DocumentAccessContext,
  ): Promise<{ url: string; expiresAt: Date }> {
    this.assertContext(context);
    const document = this.getDocument(documentId, context);
    const version =
      versionNumber === undefined ? this.getCurrentVersion(document) : this.getVersion(document, versionNumber);
    const expiresInSeconds = this.config.signedUrlExpiresInSeconds;
    const url = this.storageProvider.getSignedUrl(version.storageKey, expiresInSeconds, 'GET');
    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  private async createVersion(
    documentId: string,
    file: Express.Multer.File,
    context: DocumentAccessContext,
    versionNumber = 1,
  ): Promise<DocumentVersion> {
    await this.validateFile(file);
    await this.scanForVirus(file.buffer, file.originalname);

    const checksum = DocumentService.hashBuffer(file.buffer);
    const storageKey = this.buildStorageKey(documentId, versionNumber, file.originalname);
    await this.storageProvider.uploadObject({
      key: storageKey,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    const thumbnailKey = await this.maybeGenerateThumbnail(documentId, versionNumber, file);

    return {
      version: versionNumber,
      storageKey,
      checksum,
      size: file.size,
      mimeType: file.mimetype,
      createdAt: new Date(),
      uploadedBy: context.userId,
      originalFileName: file.originalname,
      thumbnailKey,
    };
  }

  private async maybeGenerateThumbnail(
    documentId: string,
    versionNumber: number,
    file: Express.Multer.File,
  ): Promise<string | undefined> {
    if (!file.mimetype.startsWith('image/')) {
      return undefined;
    }

    try {
      const thumbnailBuffer = await sharp(file.buffer)
        .resize(this.config.thumbnails.width, this.config.thumbnails.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFormat(this.config.thumbnails.format, {
          quality: this.config.thumbnails.quality,
        })
        .toBuffer();

      const thumbnailKey = this.buildStorageKey(
        documentId,
        versionNumber,
        `thumbnail.${this.config.thumbnails.format}`,
      );
      await this.storageProvider.uploadObject({
        key: thumbnailKey,
        buffer: thumbnailBuffer,
        contentType: `image/${this.config.thumbnails.format}`,
      });
      return thumbnailKey;
    } catch (error) {
      this.logger.warn('Failed to generate thumbnail; continuing without it');
      return undefined;
    }
  }

  private getDocumentForUpdate(documentId: string, context: DocumentAccessContext): DocumentRecord {
    const document = this.getDocument(documentId, context);
    if (!this.hasWriteAccess(document, context)) {
      throw new ForbiddenException('You do not have permission to update this document');
    }
    return document;
  }

  private validateFile(file: Express.Multer.File): void {
    if (!this.config.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > this.config.maxFileSizeBytes) {
      throw new BadRequestException('File exceeds maximum allowed size');
    }
  }

  private async scanForVirus(buffer: Buffer, filename?: string): Promise<void> {
    // Use the real MalwareScannerService if available
    if (this.malwareScanner) {
      const result = await this.malwareScanner.scanFile(buffer, filename);
      if (!result.isClean) {
        throw new BadRequestException(`Malware detected in file: ${result.virusName || 'Unknown virus'}`);
      }
      return;
    }

    // Fallback to basic signature check if no malware scanner is available
    if (buffer.toString('utf8').includes(DocumentService.virusSignature)) {
      throw new BadRequestException('File failed virus scan');
    }
  }

  private normalizeMetadata(
    input: DocumentMetadataInput,
    context: DocumentAccessContext,
    preserveOwner = false,
  ): DocumentMetadata {
    const tags = (input.tags || []).map(tag => tag.trim()).filter(Boolean);
    return {
      propertyId: input.propertyId,
      title: input.title || 'Untitled document',
      description: input.description,
      tags,
      uploadedBy: preserveOwner && input.uploadedBy ? input.uploadedBy : context.userId,
      accessLevel: input.accessLevel || DocumentAccessLevel.PRIVATE,
      allowedUserIds: input.allowedUserIds || [],
      allowedRoles: input.allowedRoles || [],
      customFields: input.customFields || {},
    };
  }

  private buildStorageKey(documentId: string, version: number, fileName: string): string {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `documents/${documentId}/v${version}/${sanitizedFileName}`;
  }

  private getCurrentVersion(document: DocumentRecord): DocumentVersion {
    const version = document.versions.find(item => item.version === document.currentVersion);
    if (!version) {
      throw new NotFoundException('Document version not found');
    }
    return version;
  }

  private getVersion(document: DocumentRecord, versionNumber: number): DocumentVersion {
    const version = document.versions.find(item => item.version === versionNumber);
    if (!version) {
      throw new NotFoundException('Document version not found');
    }
    return version;
  }

  private assertContext(context: DocumentAccessContext): void {
    if (!context?.userId) {
      throw new BadRequestException('User context is required');
    }
  }

  private hasReadAccess(document: DocumentRecord, context: DocumentAccessContext): boolean {
    if (document.metadata.accessLevel === DocumentAccessLevel.PUBLIC) {
      return true;
    }
    if (document.metadata.uploadedBy === context.userId) {
      return true;
    }
    if (document.metadata.accessLevel === DocumentAccessLevel.RESTRICTED) {
      const allowedUsers = new Set(document.metadata.allowedUserIds);
      if (allowedUsers.has(context.userId)) {
        return true;
      }
      const allowedRoles = new Set(document.metadata.allowedRoles);
      return context.roles.some(role => allowedRoles.has(role));
    }
    return false;
  }

  private hasWriteAccess(document: DocumentRecord, context: DocumentAccessContext): boolean {
    if (document.metadata.uploadedBy === context.userId) {
      return true;
    }
    const allowedRoles = new Set(document.metadata.allowedRoles);
    return context.roles.some(role => allowedRoles.has(role));
  }

  private ensureReadAccess(document: DocumentRecord, context: DocumentAccessContext): void {
    if (!this.hasReadAccess(document, context)) {
      throw new ForbiddenException('You do not have permission to access this document');
    }
  }

  static hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
