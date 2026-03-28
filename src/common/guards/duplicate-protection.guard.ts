import { Injectable, CanActivate, ExecutionContext, BadRequestException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { DuplicateValidator, DuplicateCheckOptions } from '../validators/duplicate.validator';

export interface DuplicateProtectionOptions {
  validator: keyof DuplicateValidator;
  fields: string[];
  options?: DuplicateCheckOptions;
  extractData?: (req: Request) => any;
}

@Injectable()
export class DuplicateProtectionGuard implements CanActivate {
  private readonly logger = new Logger(DuplicateProtectionGuard.name);

  constructor(private readonly duplicateValidator: DuplicateValidator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const options = (request as any).duplicateProtection as DuplicateProtectionOptions;

    if (!options) {
      this.logger.warn('DuplicateProtectionGuard used without options');
      return true;
    }

    try {
      const data = options.extractData ? options.extractData(request) : request.body;
      const checkResults = await this.performDuplicateCheck(options.validator, data, options.options);

      const duplicates = checkResults.filter(result => result.isDuplicate);
      
      if (duplicates.length > 0) {
        this.logger.warn(`Duplicate request blocked: ${duplicates.map(d => d.field).join(', ')}`, {
          duplicates: duplicates.map(d => ({ field: d.field, value: d.value })),
          method: request.method,
          url: request.url,
          ip: request.ip,
        });

        throw new BadRequestException({
          message: 'Duplicate entry detected',
          error: 'DUPLICATE_ENTRY',
          duplicates: duplicates.map(dup => ({
            field: dup.field,
            value: dup.value,
            message: dup.message,
          })),
        });
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error('Duplicate protection guard error', error);
      // Fail open - allow the request if duplicate check fails
      return true;
    }
  }

  private async performDuplicateCheck(
    validator: keyof DuplicateValidator,
    data: any,
    options?: DuplicateCheckOptions,
  ) {
    switch (validator) {
      case 'checkUserDuplicate':
        return this.duplicateValidator.checkUserDuplicate(
          data.email,
          data.walletAddress,
          options,
        );
      
      case 'checkPropertyDuplicate':
        return this.duplicateValidator.checkPropertyDuplicate(
          data.ownerId,
          data.title,
          data.location,
          data.latitude,
          data.longitude,
          options,
        );
      
      case 'checkTransactionDuplicate':
        return this.duplicateValidator.checkTransactionDuplicate(
          data.buyerId,
          data.sellerId,
          data.propertyId,
          data.amount,
          data.txHash,
          data.blockchainHash,
          options,
        );
      
      case 'checkDocumentDuplicate':
        return this.duplicateValidator.checkDocumentDuplicate(
          data.propertyId,
          data.transactionId,
          data.uploadedById,
          data.name,
          data.fileHash,
          options,
        );
      
      case 'checkValuationDuplicate':
        return this.duplicateValidator.checkValuationDuplicate(
          data.propertyId,
          data.valuationDate,
          data.source,
          options,
        );
      
      case 'checkDonationDuplicate':
        return this.duplicateValidator.checkDonationDuplicate(
          data.provider,
          data.providerTransactionId,
          options,
        );
      
      default:
        throw new Error(`Unknown validator: ${validator}`);
    }
  }
}
