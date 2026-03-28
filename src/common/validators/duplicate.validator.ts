import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  field: string;
  value: any;
  existingRecord?: any;
  message?: string;
}

export interface DuplicateCheckOptions {
  strict?: boolean;
  includeSoftDeleted?: boolean;
  checkFields?: string[];
}

@Injectable()
export class DuplicateValidator {
  private readonly logger = new Logger(DuplicateValidator.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check for duplicate user by email or wallet address
   */
  async checkUserDuplicate(
    email?: string,
    walletAddress?: string,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      // Check email duplicate
      if (email) {
        const existingUser = await this.prisma.user.findFirst({
          where: {
            email: email.toLowerCase(),
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingUser) {
          results.push({
            isDuplicate: true,
            field: 'email',
            value: email,
            existingRecord: existingUser,
            message: `User with email ${email} already exists`,
          });
        }
      }

      // Check wallet address duplicate
      if (walletAddress) {
        const existingUser = await this.prisma.user.findFirst({
          where: {
            walletAddress: walletAddress.toLowerCase(),
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingUser) {
          results.push({
            isDuplicate: true,
            field: 'walletAddress',
            value: walletAddress,
            existingRecord: existingUser,
            message: `User with wallet address ${walletAddress} already exists`,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error checking user duplicate', error);
      throw error;
    }

    return results;
  }

  /**
   * Check for duplicate property
   */
  async checkPropertyDuplicate(
    ownerId: string,
    title: string,
    location: string,
    latitude?: number,
    longitude?: number,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      // Check duplicate by owner, title, and location
      const existingProperty = await this.prisma.property.findFirst({
        where: {
          ownerId,
          title: title.trim(),
          location: location.trim(),
          ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
        },
      });

      if (existingProperty) {
        results.push({
          isDuplicate: true,
          field: 'title_location',
          value: { title, location },
          existingRecord: existingProperty,
          message: `Property with title "${title}" and location "${location}" already exists for this owner`,
        });
      }

      // Check duplicate by coordinates if provided
      if (latitude !== undefined && longitude !== undefined) {
        const existingPropertyByCoords = await this.prisma.property.findFirst({
          where: {
            ownerId,
            latitude,
            longitude,
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingPropertyByCoords) {
          results.push({
            isDuplicate: true,
            field: 'coordinates',
            value: { latitude, longitude },
            existingRecord: existingPropertyByCoords,
            message: `Property at coordinates (${latitude}, ${longitude}) already exists for this owner`,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error checking property duplicate', error);
      throw error;
    }

    return results;
  }

  /**
   * Check for duplicate transaction
   */
  async checkTransactionDuplicate(
    buyerId: string,
    sellerId: string,
    propertyId: string,
    amount: string,
    txHash?: string,
    blockchainHash?: string,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      // Check duplicate by transaction hash
      if (txHash) {
        const existingTx = await this.prisma.transaction.findFirst({
          where: {
            txHash,
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingTx) {
          results.push({
            isDuplicate: true,
            field: 'txHash',
            value: txHash,
            existingRecord: existingTx,
            message: `Transaction with hash ${txHash} already exists`,
          });
        }
      }

      // Check duplicate by blockchain hash
      if (blockchainHash) {
        const existingTx = await this.prisma.transaction.findFirst({
          where: {
            blockchainHash,
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingTx) {
          results.push({
            isDuplicate: true,
            field: 'blockchainHash',
            value: blockchainHash,
            existingRecord: existingTx,
            message: `Transaction with blockchain hash ${blockchainHash} already exists`,
          });
        }
      }

      // Check duplicate by business logic (same parties, property, amount, time)
      const now = new Date();
      const timeWindow = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      const existingBusinessTx = await this.prisma.transaction.findFirst({
        where: {
          buyerId,
          sellerId,
          propertyId,
          amount,
          createdAt: {
            gte: timeWindow,
          },
          ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
        },
      });

      if (existingBusinessTx && options.strict) {
        results.push({
          isDuplicate: true,
          field: 'business_logic',
          value: { buyerId, sellerId, propertyId, amount },
          existingRecord: existingBusinessTx,
          message: `Duplicate transaction detected: same parties, property, and amount within time window`,
        });
      }
    } catch (error) {
      this.logger.error('Error checking transaction duplicate', error);
      throw error;
    }

    return results;
  }

  /**
   * Check for duplicate document
   */
  async checkDocumentDuplicate(
    propertyId: string | undefined,
    transactionId: string | undefined,
    uploadedById: string,
    name: string,
    fileHash?: string,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      // Check duplicate by file hash
      if (fileHash) {
        const existingDoc = await this.prisma.document.findFirst({
          where: {
            fileHash,
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingDoc) {
          results.push({
            isDuplicate: true,
            field: 'fileHash',
            value: fileHash,
            existingRecord: existingDoc,
            message: `Document with file hash ${fileHash} already exists`,
          });
        }
      }

      // Check duplicate by property, name, and hash
      if (propertyId && fileHash) {
        const existingDoc = await this.prisma.document.findFirst({
          where: {
            propertyId,
            name: name.trim(),
            fileHash,
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingDoc) {
          results.push({
            isDuplicate: true,
            field: 'property_name_hash',
            value: { propertyId, name, fileHash },
            existingRecord: existingDoc,
            message: `Document with name "${name}" already exists for this property`,
          });
        }
      }

      // Check duplicate by uploader, name, and hash
      if (fileHash) {
        const existingDoc = await this.prisma.document.findFirst({
          where: {
            uploadedById,
            name: name.trim(),
            fileHash,
            ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
          },
        });

        if (existingDoc) {
          results.push({
            isDuplicate: true,
            field: 'uploader_name_hash',
            value: { uploadedById, name, fileHash },
            existingRecord: existingDoc,
            message: `Document with name "${name}" already uploaded by this user`,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error checking document duplicate', error);
      throw error;
    }

    return results;
  }

  /**
   * Check for duplicate property valuation
   */
  async checkValuationDuplicate(
    propertyId: string,
    valuationDate: Date,
    source: string,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      const existingValuation = await this.prisma.propertyValuation.findFirst({
        where: {
          propertyId,
          valuationDate,
          source,
          ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
        },
      });

      if (existingValuation) {
        results.push({
          isDuplicate: true,
          field: 'property_date_source',
          value: { propertyId, valuationDate, source },
          existingRecord: existingValuation,
          message: `Valuation for property ${propertyId} on ${valuationDate.toISOString()} from source ${source} already exists`,
        });
      }
    } catch (error) {
      this.logger.error('Error checking valuation duplicate', error);
      throw error;
    }

    return results;
  }

  /**
   * Check for duplicate donation
   */
  async checkDonationDuplicate(
    provider: string,
    providerTransactionId: string,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      const existingDonation = await this.prisma.donation.findFirst({
        where: {
          provider,
          providerTransactionId,
          ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
        },
      });

      if (existingDonation) {
        results.push({
          isDuplicate: true,
          field: 'provider_transaction_id',
          value: { provider, providerTransactionId },
          existingRecord: existingDonation,
          message: `Donation from provider ${provider} with transaction ID ${providerTransactionId} already exists`,
        });
      }
    } catch (error) {
      this.logger.error('Error checking donation duplicate', error);
      throw error;
    }

    return results;
  }

  /**
   * Generic duplicate check for any model
   */
  async checkGenericDuplicate(
    model: keyof PrismaService,
    uniqueFields: Record<string, any>,
    options: DuplicateCheckOptions = {},
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    try {
      const modelService = this.prisma[model] as any;
      const existingRecord = await modelService.findFirst({
        where: {
          ...uniqueFields,
          ...(options.includeSoftDeleted ? {} : { deletedAt: null }),
        },
      });

      if (existingRecord) {
        results.push({
          isDuplicate: true,
          field: Object.keys(uniqueFields).join('_'),
          value: uniqueFields,
          existingRecord,
          message: `Duplicate record found in ${model} with fields: ${Object.keys(uniqueFields).join(', ')}`,
        });
      }
    } catch (error) {
      this.logger.error(`Error checking duplicate in ${model}`, error);
      throw error;
    }

    return results;
  }

  /**
   * Validate that no duplicates exist
   */
  async validateNoDuplicates(checkResults: DuplicateCheckResult[]): Promise<void> {
    const duplicates = checkResults.filter(result => result.isDuplicate);
    
    if (duplicates.length > 0) {
      const messages = duplicates.map(dup => dup.message).join('; ');
      throw new Error(`Duplicate validation failed: ${messages}`);
    }
  }
}
