export type StorageProviderName = 's3' | 'memory';

export interface StorageConfig {
  provider: StorageProviderName;
  signedUrlExpiresInSeconds: number;
  signingSecret: string;
  mockStorageBaseUrl: string;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  thumbnails: {
    width: number;
    height: number;
    format: 'jpeg' | 'png' | 'webp';
    quality: number;
  };
  s3: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    forcePathStyle: boolean;
  };
}

export default (): StorageConfig => ({
  provider: (process.env.STORAGE_PROVIDER as StorageProviderName) || 's3',
  signedUrlExpiresInSeconds: parseInt(process.env.STORAGE_SIGNED_URL_EXPIRES_IN, 10) || 900,
  signingSecret: process.env.STORAGE_SIGNING_SECRET || 'local-storage-signing-secret',
  mockStorageBaseUrl: process.env.MOCK_STORAGE_BASE_URL || 'http://localhost/mock-storage',
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024,
  allowedMimeTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ],
  thumbnails: {
    width: parseInt(process.env.THUMBNAIL_WIDTH, 10) || 320,
    height: parseInt(process.env.THUMBNAIL_HEIGHT, 10) || 320,
    format: (process.env.THUMBNAIL_FORMAT as 'jpeg' | 'png' | 'webp') || 'webp',
    quality: parseInt(process.env.THUMBNAIL_QUALITY, 10) || 80,
  },
  s3: {
    bucket: process.env.S3_BUCKET || 'propchain-documents',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
});
