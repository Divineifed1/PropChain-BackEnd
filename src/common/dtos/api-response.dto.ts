import { ApiProperty } from '@nestjs/swagger';

/**
 * Standardized API Response Structure
 * Unified format for all success and error responses
 */
export class ApiResponseDto<T> {
  @ApiProperty({ description: 'Indicates if the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Response data payload', required: false })
  data: T | null;

  @ApiProperty({
    description: 'Error details if success is false',
    required: false,
    type: 'object',
    properties: {
      code: { type: 'string' },
      details: { type: 'array', items: { type: 'string' } },
    },
  })
  error?: {
    code: string;
    details?: string[];
  };

  @ApiProperty({ description: 'UTC timestamp of the response' })
  timestamp: string;

  @ApiProperty({ description: 'API request path' })
  path: string;

  @ApiProperty({ description: 'Unique request/correlation identifier' })
  requestId: string;

  constructor(partial: Partial<ApiResponseDto<T>>) {
    Object.assign(this, partial);
    this.timestamp = this.timestamp || new Date().toISOString();
  }

  /**
   * Static helper to create a success response
   */
  static success<T>(data: T, message = 'Success', statusCode = 200, path?: string, requestId?: string): ApiResponseDto<T> {
    return new ApiResponseDto({
      success: true,
      statusCode,
      message,
      data,
      path,
      requestId,
    });
  }

  /**
   * Static helper to create an error response
   */
  static error(
    message: string,
    errorCode: string,
    statusCode = 400,
    details?: string[],
    path?: string,
    requestId?: string,
  ): ApiResponseDto<null> {
    return new ApiResponseDto({
      success: false,
      statusCode,
      message,
      data: null,
      error: {
        code: errorCode,
        details,
      },
      path,
      requestId,
    });
  }
}
