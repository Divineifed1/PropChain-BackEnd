import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PropertiesHealthIndicator, PropertiesHealthResult } from './properties-health.indicator';

@ApiTags('Properties')
@Controller('properties/health')
export class PropertiesHealthController {
  constructor(private readonly indicator: PropertiesHealthIndicator) {}

  /**
   * Unauthenticated probe: 200 when the Property API's dependencies are up, 503 otherwise.
   * Registered before PropertiesController so `GET /properties/health` is not
   * captured by `GET /properties/:id`.
   */
  @Get()
  @ApiOperation({
    summary: 'Property API health probe',
    description: 'Reports whether the database backing the Property API is reachable.',
    operationId: 'getPropertiesHealth',
  })
  @ApiResponse({ status: 200, description: 'The Property API can serve requests' })
  @ApiResponse({ status: 503, description: 'A dependency is down' })
  async health(): Promise<PropertiesHealthResult> {
    const result = await this.indicator.check();
    if (result.status === 'down') throw new ServiceUnavailableException(result);
    return result;
  }
}
