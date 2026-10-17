import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersHealthIndicator, UsersHealthResult } from './users-health.indicator';

@ApiTags('Users')
@Controller('users/health')
export class UsersHealthController {
  constructor(private readonly indicator: UsersHealthIndicator) {}

  /**
   * Unauthenticated probe: 200 when the Users API's dependencies are up, 503 otherwise.
   * Registered before UsersController so `GET /users/health` is not captured by `GET /users/:id`.
   */
  @Get()
  async health(): Promise<UsersHealthResult> {
    const result = await this.indicator.check();
    if (result.status === 'down') throw new ServiceUnavailableException(result);
    return result;
  }
}
