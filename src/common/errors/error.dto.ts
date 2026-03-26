import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'Indicates if the operation was successful (always false for errors)',
    example: false,
  })
  success: boolean = false;

  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'User-friendly error message',
    example: 'The provided data is invalid',
  })
  message: string;

  @ApiProperty({
    description: 'Response data payload (always null for errors)',
    example: null,
  })
  data: null = null;

  @ApiProperty({
    description: 'Error details',
    type: 'object',
    properties: {
      code: { type: 'string', example: 'VALIDATION_ERROR' },
      details: { type: 'array', items: { type: 'string' }, example: ['email must be a valid email address'] },
    },
  })
  error: {
    code: string;
    details?: string[];
  };

  @ApiProperty({
    description: 'Timestamp of the error',
    example: '2024-01-22T10:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path where error occurred',
    example: '/api/v1/users',
  })
  path: string;

  @ApiProperty({
    description: 'Unique request identifier for tracking',
    example: 'req_abc123xyz',
    required: false,
  })
  requestId?: string;

  constructor(partial: Partial<ErrorResponseDto>) {
    Object.assign(this, partial);
    this.timestamp = this.timestamp || new Date().toISOString();
    this.success = false;
    this.data = null;
  }
}
