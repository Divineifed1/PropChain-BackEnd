import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthHealthIndicator, AuthHealthResult } from './auth-health.indicator';

@ApiTags('Authentication')
@Controller('auth/health')
export class AuthHealthController {
  constructor(private readonly indicator: AuthHealthIndicator) {}

  /** Unauthenticated probe: 200 when the Auth API's dependencies are up, 503 otherwise. */
  @Get()
  async health(): Promise<AuthHealthResult> {
    const result = await this.indicator.check();
    if (result.status === 'down') throw new ServiceUnavailableException(result);
    return result;
  }
}
