import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { DashboardDto } from './dto/dashboard.dto';
import { DashboardTraceInterceptor } from './interceptors/dashboard-trace.interceptor';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseInterceptors(DashboardTraceInterceptor)
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(@CurrentUser() user: AuthUserPayload): Promise<DashboardDto> {
    return this.dashboardService.getDashboard(user.sub);
  }
}
