import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateProtectionGuard } from '../guards/duplicate-protection.guard';
import { DuplicateValidator } from '../validators/duplicate.validator';
import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { Request } from 'express';

describe('DuplicateProtectionGuard', () => {
  let guard: DuplicateProtectionGuard;
  let validator: DuplicateValidator;

  const mockValidator = {
    checkUserDuplicate: jest.fn(),
    checkPropertyDuplicate: jest.fn(),
    checkTransactionDuplicate: jest.fn(),
    checkDocumentDuplicate: jest.fn(),
    checkValuationDuplicate: jest.fn(),
    checkDonationDuplicate: jest.fn(),
  };

  const mockContext = (options: any, body: any = {}) => {
    const request = {
      body,
      duplicateProtection: options,
      method: 'POST',
      url: '/test',
      ip: '127.0.0.1',
    } as any;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateProtectionGuard,
        {
          provide: DuplicateValidator,
          useValue: mockValidator,
        },
      ],
    }).compile();

    guard = module.get<DuplicateProtectionGuard>(DuplicateProtectionGuard);
    validator = module.get<DuplicateValidator>(DuplicateValidator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow request when no duplicates found', async () => {
      const options = {
        validator: 'checkUserDuplicate',
        fields: ['email'],
      };

      mockValidator.checkUserDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(mockContext(options, { email: 'test@example.com' }));

      expect(result).toBe(true);
      expect(mockValidator.checkUserDuplicate).toHaveBeenCalledWith('test@example.com', undefined, undefined);
    });

    it('should block request when duplicates found', async () => {
      const options = {
        validator: 'checkUserDuplicate',
        fields: ['email'],
      };

      const duplicateResult = [
        {
          isDuplicate: true,
          field: 'email',
          value: 'test@example.com',
          message: 'User with email test@example.com already exists',
        },
      ];

      mockValidator.checkUserDuplicate.mockResolvedValue(duplicateResult);

      await expect(guard.canActivate(mockContext(options, { email: 'test@example.com' }))).rejects.toThrow(
        BadRequestException
      );
    });

    it('should use extractData function when provided', async () => {
      const options = {
        validator: 'checkTransactionDuplicate',
        fields: ['txHash'],
        extractData: (req: Request) => ({ txHash: req.body.transactionHash }),
      };

      mockValidator.checkTransactionDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(
        mockContext(options, { transactionHash: '0x123' })
      );

      expect(result).toBe(true);
      expect(mockValidator.checkTransactionDuplicate).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        '0x123',
        undefined,
        undefined
      );
    });

    it('should allow request when no options provided', async () => {
      const result = await guard.canActivate(mockContext(null));

      expect(result).toBe(true);
    });

    it('should handle validator errors gracefully', async () => {
      const options = {
        validator: 'checkUserDuplicate',
        fields: ['email'],
      };

      mockValidator.checkUserDuplicate.mockRejectedValue(new Error('Database error'));

      const result = await guard.canActivate(mockContext(options, { email: 'test@example.com' }));

      expect(result).toBe(true); // Fail open
    });

    it('should work with property validation', async () => {
      const options = {
        validator: 'checkPropertyDuplicate',
        fields: ['title', 'location'],
      };

      mockValidator.checkPropertyDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(
        mockContext(options, {
          ownerId: 'owner1',
          title: 'Test Property',
          location: 'Test City',
        })
      );

      expect(result).toBe(true);
      expect(mockValidator.checkPropertyDuplicate).toHaveBeenCalledWith(
        'owner1',
        'Test Property',
        'Test City',
        undefined,
        undefined,
        undefined
      );
    });

    it('should work with transaction validation', async () => {
      const options = {
        validator: 'checkTransactionDuplicate',
        fields: ['txHash'],
      };

      mockValidator.checkTransactionDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(
        mockContext(options, {
          buyerId: 'buyer1',
          sellerId: 'seller1',
          propertyId: 'prop1',
          amount: '1000',
          txHash: '0x123',
        })
      );

      expect(result).toBe(true);
      expect(mockValidator.checkTransactionDuplicate).toHaveBeenCalledWith(
        'buyer1',
        'seller1',
        'prop1',
        '1000',
        '0x123',
        undefined,
        undefined
      );
    });

    it('should work with document validation', async () => {
      const options = {
        validator: 'checkDocumentDuplicate',
        fields: ['fileHash'],
      };

      mockValidator.checkDocumentDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(
        mockContext(options, {
          uploadedById: 'user1',
          name: 'test.pdf',
          fileHash: 'hash123',
        })
      );

      expect(result).toBe(true);
      expect(mockValidator.checkDocumentDuplicate).toHaveBeenCalledWith(
        undefined,
        undefined,
        'user1',
        'test.pdf',
        'hash123',
        undefined
      );
    });

    it('should work with valuation validation', async () => {
      const options = {
        validator: 'checkValuationDuplicate',
        fields: ['propertyId', 'valuationDate', 'source'],
      };

      mockValidator.checkValuationDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(
        mockContext(options, {
          propertyId: 'prop1',
          valuationDate: new Date('2023-01-01'),
          source: 'automated',
        })
      );

      expect(result).toBe(true);
      expect(mockValidator.checkValuationDuplicate).toHaveBeenCalledWith(
        'prop1',
        new Date('2023-01-01'),
        'automated',
        undefined
      );
    });

    it('should work with donation validation', async () => {
      const options = {
        validator: 'checkDonationDuplicate',
        fields: ['provider', 'providerTransactionId'],
      };

      mockValidator.checkDonationDuplicate.mockResolvedValue([]);

      const result = await guard.canActivate(
        mockContext(options, {
          provider: 'stripe',
          providerTransactionId: 'tx_123',
        })
      );

      expect(result).toBe(true);
      expect(mockValidator.checkDonationDuplicate).toHaveBeenCalledWith('stripe', 'tx_123', undefined);
    });

    it('should throw BadRequestException with correct format', async () => {
      const options = {
        validator: 'checkUserDuplicate',
        fields: ['email'],
      };

      const duplicateResult = [
        {
          isDuplicate: true,
          field: 'email',
          value: 'test@example.com',
          message: 'User with email test@example.com already exists',
        },
      ];

      mockValidator.checkUserDuplicate.mockResolvedValue(duplicateResult);

      try {
        await guard.canActivate(mockContext(options, { email: 'test@example.com' }));
        fail('Expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.response.message).toBe('Duplicate entry detected');
        expect(error.response.error).toBe('DUPLICATE_ENTRY');
        expect(error.response.duplicates).toHaveLength(1);
        expect(error.response.duplicates[0].field).toBe('email');
        expect(error.response.duplicates[0].value).toBe('test@example.com');
      }
    });

    it('should handle unknown validator error', async () => {
      const options = {
        validator: 'unknownValidator' as any,
        fields: ['email'],
      };

      await expect(guard.canActivate(mockContext(options, { email: 'test@example.com' }))).rejects.toThrow(
        'Unknown validator: unknownValidator'
      );
    });
  });
});
