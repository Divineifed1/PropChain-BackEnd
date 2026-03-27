import { Injectable } from '@nestjs/common';
import { PuzzlesRepository } from './puzzles.repository';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';
import { CursorPaginationResponse } from './interfaces/cursor-pagination-response.interface';
import { PuzzleEntity } from './entities/puzzle.entity';

@Injectable()
export class PuzzlesService {
  constructor(private readonly repo: PuzzlesRepository) {}

  async getPaginatedPuzzles(
    params: CursorPaginationDto,
  ): Promise<CursorPaginationResponse<PuzzleEntity>> {
    return this.repo.findWithCursor(params);
  }
}