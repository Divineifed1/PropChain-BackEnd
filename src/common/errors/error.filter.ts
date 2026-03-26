import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ErrorResponseDto } from './error.dto';
import { ErrorCode, ErrorMessages } from './error.codes';
import { v4 as uuidv4 } from 'uuid';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { StructuredLoggerService } from '../logging/logger.service';
import { getCorrelationId } from '../logging/correlation-id';
import axios from 'axios';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: StructuredLoggerService,
    private readonly i18n: I18nService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) || uuidv4();

    let errorResponse: ErrorResponseDto;

    if (exception instanceof HttpException) {
      errorResponse = this.handleHttpException(exception, request, requestId);
    } else {
      errorResponse = this.handleUnknownException(exception, request, requestId);
    }

    const correlationId = getCorrelationId();

    this.loggerService.error(
      `Error occurred: ${errorResponse.error.code} - ${errorResponse.message}`,
      exception instanceof Error ? exception.stack : undefined,
      {
        requestId,
        correlationId,
        path: request.url,
        method: request.method,
        statusCode: errorResponse.statusCode,
        details: errorResponse.error.details,
      },
    );

    const alertWebhookUrl = this.configService.get<string>('ERROR_ALERT_WEBHOOK_URL');
    if (alertWebhookUrl && errorResponse.statusCode >= 500) {
      axios
        .post(alertWebhookUrl, {
          errorCode: errorResponse.error.code,
          message: errorResponse.message,
          statusCode: errorResponse.statusCode,
          path: request.url,
          method: request.method,
          requestId,
          correlationId,
          timestamp: errorResponse.timestamp,
        })
        .catch(() => undefined);
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private handleHttpException(exception: HttpException, request: Request, requestId: string): ErrorResponseDto {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let errorCode: ErrorCode;
    let message: string;
    let details: string[] | undefined;

    const lang = I18nContext.current()?.lang || request.headers['accept-language'] || 'en';

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as any;

      // Handle validation errors
      if (Array.isArray(responseObj.message)) {
        errorCode = ErrorCode.VALIDATION_ERROR;
        message = this.i18n.translate(`errors.${ErrorCode.VALIDATION_ERROR}`, { lang }) as string;
        details = responseObj.message;
      } else {
        errorCode = this.mapStatusToErrorCode(status);
        const translatedMessage = this.i18n.translate(`errors.${errorCode}`, { lang }) as string;
        // fallback to standard message if translation key returns itself or we didn't translate
        message =
          responseObj.message ||
          (translatedMessage !== `errors.${errorCode}` ? translatedMessage : ErrorMessages[errorCode]);
        details = responseObj.details;
      }
    } else {
      errorCode = this.mapStatusToErrorCode(status);
      message = exceptionResponse.toString();
    }

    return new ErrorResponseDto({
      statusCode: status,
      message,
      path: request.url,
      requestId,
      error: {
        code: errorCode,
        details,
      },
    });
  }

  private handleUnknownException(exception: unknown, request: Request, requestId: string): ErrorResponseDto {
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    const lang = I18nContext.current()?.lang || request.headers['accept-language'] || 'en';

    let message = this.i18n.translate(`errors.${errorCode}`, { lang }) as string;
    if (message === `errors.${errorCode}`) {
      message = ErrorMessages[errorCode];
    }

    // In production, don't expose internal error details
    const details =
      process.env.NODE_ENV !== 'production' && exception instanceof Error ? [exception.message] : undefined;

    return new ErrorResponseDto({
      statusCode: status,
      message,
      path: request.url,
      requestId,
      error: {
        code: errorCode,
        details,
      },
    });
  }

  private mapStatusToErrorCode(status: HttpStatus): ErrorCode {
    const statusToErrorCode: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_SERVER_ERROR,
    };

    return statusToErrorCode[status] || ErrorCode.INTERNAL_SERVER_ERROR;
  }
}

// Export alias for backward compatibility
export { AllExceptionsFilter as AppExceptionFilter };
