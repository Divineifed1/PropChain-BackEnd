import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SignedUrlResponse } from './signed-url-provider.interface';
import { SIGNED_URL_PROVIDER_TOKEN } from '../documents.module';
import { SignedUrlProvider, SignedUrlRequest } from './signed-url-provider.interface';

@Injectable()
export class SignedUrlService implements OnModuleInit {
  private readonly logger = new Logger(SignedUrlService.name);

  constructor(
    @Inject(SIGNED_URL_PROVIDER_TOKEN)
    private readonly provider: SignedUrlProvider,
  ) {}

  /**
   * Startup diagnostic (issue #1186): a deployment that forgets to configure
   * object storage should fail loudly at boot, not on the first user download.
   *
   * Logs which provider is active and whether it is functional. In production,
   * a missing/unconfigured provider aborts application startup so the health
   * probe (and orchestrator) surface the misconfiguration immediately.
   */
  onModuleInit(): void {
    const activeProvider = this.activeProviderName();
    const configured = this.isConfigured();
    if (configured) {
      this.logger.log(`Signed URL provider '${activeProvider}' is active and functional.`);
      return;
    }

    const message =
      `Signed URL provider '${activeProvider}' is NOT configured. ` +
      `Document upload/download endpoints requiring signed URLs will fail (HTTP 500). ` +
      `Set SIGNED_URL_PROVIDER and the matching credentials (AWS/GCS/Azure) before relying on document endpoints.`;

    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[SignedUrlService] ${message}`);
    }
    this.logger.error(message);
  }

  activeProviderName(): string {
    const provider = (process.env.SIGNED_URL_PROVIDER ?? 'not-configured').toLowerCase();
    return provider;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  async getSignedUrl(req: SignedUrlRequest): Promise<SignedUrlResponse> {
    try {
      return await this.provider.getSignedUrl(req);
    } catch (e: unknown) {
      throw new InternalServerErrorException(
        (e instanceof Error ? e.message : undefined) ?? 'Failed to get signed URL',
      );
    }
  }
}
