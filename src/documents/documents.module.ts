import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import storageConfig from '../config/storage.config';
import { DocumentController } from './document.controller';
import {
  DocumentService,
  InMemoryStorageProvider,
  S3StorageProvider,
  STORAGE_CONFIG,
  STORAGE_PROVIDER,
} from './document.service';
import { FileStorageService } from './storage/file-storage.service';
import { SecureFileValidator } from '../security/validators/secure-file.validator';
import { FileValidationService } from '../security/services/file-validation.service';
import { MalwareScannerService } from '../security/services/malware-scanner.service';
import {
  DocumentFilesUploadInterceptor,
  DocumentFileUploadInterceptor,
} from './interceptors/document-upload.interceptor';

@Module({
  controllers: [DocumentController],
  providers: [
    DocumentService,
    FileStorageService,
    SecureFileValidator,
    FileValidationService,
    MalwareScannerService,
    DocumentFilesUploadInterceptor,
    DocumentFileUploadInterceptor,
    {
      provide: STORAGE_CONFIG,
      useFactory: storageConfig,
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ReturnType<typeof storageConfig>) => {
        if (config.provider === 'memory') {
          return new InMemoryStorageProvider(config);
        }
        return new S3StorageProvider(config);
      },
      inject: [STORAGE_CONFIG],
    },
  ],
  imports: [ConfigModule],
})
export class DocumentsModule {}
