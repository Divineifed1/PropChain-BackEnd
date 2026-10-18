import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const PROPERTIES_DEFAULT_PAGE_SIZE = 20;
export const PROPERTIES_MAX_PAGE_SIZE = 100;

export class PropertiesPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PROPERTIES_MAX_PAGE_SIZE)
  limit?: number;
}

export function buildPropertiesPageMeta(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNext: page < totalPages };
}
