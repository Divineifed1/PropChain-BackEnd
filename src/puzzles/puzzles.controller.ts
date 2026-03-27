import { Controller, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { PuzzlesService } from './puzzles.service';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('puzzles')
@UseGuards(JwtAuthGuard)
export class PuzzlesController {
  constructor(private readonly service: PuzzlesService) {}

  @Get('paginated')
  async getPaginated(
    @Query(new ValidationPipe({ transform: true }))
    query: CursorPaginationDto,
  ) {
    return this.service.getPaginatedPuzzles(query);
  }
}