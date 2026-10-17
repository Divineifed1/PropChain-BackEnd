import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const AUTH_DEFAULT_PAGE_SIZE = 20;
export const AUTH_MAX_PAGE_SIZE = 100;

export class AuthPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUTH_MAX_PAGE_SIZE)
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
}

export function buildPageMeta(page: number, limit: number, total: number): PaginatedResult<never>['meta'] {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNext: page < totalPages };
}
