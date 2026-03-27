import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string; // base64 encoded ID or timestamp

  @IsOptional()
  @IsInt()
  @Min(1)
  limit = 20; // default page size
}

export class CursorPaginationResponse<T> {
  data: T[];
  nextCursor?: string;
  hasNextPage: boolean;
}
