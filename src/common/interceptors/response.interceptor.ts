import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { StructuredLoggerService } from '../logging/logger.service';
import { ApiResponseDto } from '../dtos/api-response.dto';
import { getCorrelationId } from '../logging/correlation-id';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponseDto<T>> {
  constructor(private readonly loggerService: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponseDto<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();
    const userId = (request as any).user?.id;
    const correlationId = getCorrelationId();

    return next.handle().pipe(
      map(data => {
        const duration = Date.now() - startTime;
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;

        this.loggerService.logResponse(request.method, request.url, statusCode, duration, {
          userId,
        });

        // Determine message based on status code
        let message = 'Success';
        if (statusCode >= 200 && statusCode < 300) {
          message = this.getSuccessMessage(request.method);
        }

        return ApiResponseDto.success(data, message, statusCode, request.url, correlationId);
      }),
    );
  }

  private getSuccessMessage(method: string): string {
    const messages: Record<string, string> = {
      GET: 'Resource retrieved successfully',
      POST: 'Resource created successfully',
      PUT: 'Resource updated successfully',
      PATCH: 'Resource updated successfully',
      DELETE: 'Resource deleted successfully',
    };

    return messages[method] || 'Operation completed successfully';
  }
}
