import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateValidator } from '../validators/duplicate.validator';
import { PrismaService } from '../database/prisma/prisma.service';

describe('DuplicateValidator', () => {
  let validator: DuplicateValidator;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
    },
    property: {
      findFirst: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
    },
    document: {
      findFirst: jest.fn(),
    },
    propertyValuation: {
      findFirst: jest.fn(),
    },
    donation: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateValidator,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    validator = module.get<DuplicateValidator>(DuplicateValidator);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(validator).toBeDefined();
  });

  describe('checkUserDuplicate', () => {
    it('should detect duplicate email', async () => {
      const existingUser = { id: '1', email: 'test@example.com' };
      mockPrisma.user.findFirst.mockResolvedValue(existingUser);

      const result = await validator.checkUserDuplicate('test@example.com');

      expect(result).toHaveLength(1);
      expect(result[0].isDuplicate).toBe(true);
      expect(result[0].field).toBe('email');
      expect(result[0].value).toBe('test@example.com');
    });

    it('should detect duplicate wallet address', async () => {
      const existingUser = { id: '1', walletAddress: '0x123' };
      mockPrisma.user.findFirst.mockResolvedValue(existingUser);

      const result = await validator.checkUserDuplicate(undefined, '0x123');

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('walletAddress');
    });

    it('should return no duplicates for unique user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await validator.checkUserDuplicate('new@example.com', '0x456');

      expect(result).toHaveLength(0);
    });
  });

  describe('checkPropertyDuplicate', () => {
    it('should detect duplicate by title and location', async () => {
      const existingProperty = { id: '1', title: 'Test Property', location: 'Test City' };
      mockPrisma.property.findFirst.mockResolvedValue(existingProperty);

      const result = await validator.checkPropertyDuplicate(
        'owner1',
        'Test Property',
        'Test City'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('title_location');
    });

    it('should detect duplicate by coordinates', async () => {
      const existingProperty = { id: '1', latitude: 40.7128, longitude: -74.0060 };
      mockPrisma.property.findFirst.mockResolvedValue(existingProperty);

      const result = await validator.checkPropertyDuplicate(
        'owner1',
        'Test Property',
        'Test City',
        40.7128,
        -74.0060
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('coordinates');
    });

    it('should return no duplicates for unique property', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);

      const result = await validator.checkPropertyDuplicate(
        'owner1',
        'Unique Property',
        'Unique City'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('checkTransactionDuplicate', () => {
    it('should detect duplicate by transaction hash', async () => {
      const existingTx = { id: '1', txHash: '0xabc123' };
      mockPrisma.transaction.findFirst.mockResolvedValue(existingTx);

      const result = await validator.checkTransactionDuplicate(
        'buyer1',
        'seller1',
        'prop1',
        '1000',
        '0xabc123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('txHash');
    });

    it('should detect duplicate by blockchain hash', async () => {
      const existingTx = { id: '1', blockchainHash: '0xdef456' };
      mockPrisma.transaction.findFirst.mockResolvedValue(existingTx);

      const result = await validator.checkTransactionDuplicate(
        'buyer1',
        'seller1',
        'prop1',
        '1000',
        undefined,
        '0xdef456'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('blockchainHash');
    });

    it('should detect duplicate by business logic in strict mode', async () => {
      const existingTx = {
        id: '1',
        buyerId: 'buyer1',
        sellerId: 'seller1',
        propertyId: 'prop1',
        amount: '1000',
        createdAt: new Date(),
      };
      mockPrisma.transaction.findFirst.mockResolvedValue(existingTx);

      const result = await validator.checkTransactionDuplicate(
        'buyer1',
        'seller1',
        'prop1',
        '1000',
        undefined,
        undefined,
        { strict: true }
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('business_logic');
    });

    it('should not detect business logic duplicate in non-strict mode', async () => {
      const existingTx = {
        id: '1',
        buyerId: 'buyer1',
        sellerId: 'seller1',
        propertyId: 'prop1',
        amount: '1000',
        createdAt: new Date(),
      };
      mockPrisma.transaction.findFirst.mockResolvedValue(existingTx);

      const result = await validator.checkTransactionDuplicate(
        'buyer1',
        'seller1',
        'prop1',
        '1000',
        undefined,
        undefined,
        { strict: false }
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('checkDocumentDuplicate', () => {
    it('should detect duplicate by file hash', async () => {
      const existingDoc = { id: '1', fileHash: 'hash123' };
      mockPrisma.document.findFirst.mockResolvedValue(existingDoc);

      const result = await validator.checkDocumentDuplicate(
        undefined,
        undefined,
        'user1',
        'test.pdf',
        'hash123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('fileHash');
    });

    it('should detect duplicate by property, name, and hash', async () => {
      const existingDoc = { id: '1', propertyId: 'prop1', name: 'test.pdf', fileHash: 'hash123' };
      mockPrisma.document.findFirst.mockResolvedValue(existingDoc);

      const result = await validator.checkDocumentDuplicate(
        'prop1',
        undefined,
        'user1',
        'test.pdf',
        'hash123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('property_name_hash');
    });

    it('should detect duplicate by uploader, name, and hash', async () => {
      const existingDoc = { id: '1', uploadedById: 'user1', name: 'test.pdf', fileHash: 'hash123' };
      mockPrisma.document.findFirst.mockResolvedValue(existingDoc);

      const result = await validator.checkDocumentDuplicate(
        undefined,
        undefined,
        'user1',
        'test.pdf',
        'hash123'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('uploader_name_hash');
    });
  });

  describe('checkValuationDuplicate', () => {
    it('should detect duplicate valuation', async () => {
      const existingValuation = {
        id: '1',
        propertyId: 'prop1',
        valuationDate: new Date('2023-01-01'),
        source: 'automated',
      };
      mockPrisma.propertyValuation.findFirst.mockResolvedValue(existingValuation);

      const result = await validator.checkValuationDuplicate(
        'prop1',
        new Date('2023-01-01'),
        'automated'
      );

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('property_date_source');
    });

    it('should return no duplicates for unique valuation', async () => {
      mockPrisma.propertyValuation.findFirst.mockResolvedValue(null);

      const result = await validator.checkValuationDuplicate(
        'prop1',
        new Date('2023-01-01'),
        'manual'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('checkDonationDuplicate', () => {
    it('should detect duplicate donation', async () => {
      const existingDonation = {
        id: '1',
        provider: 'stripe',
        providerTransactionId: 'tx_123',
      };
      mockPrisma.donation.findFirst.mockResolvedValue(existingDonation);

      const result = await validator.checkDonationDuplicate('stripe', 'tx_123');

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('provider_transaction_id');
    });

    it('should return no duplicates for unique donation', async () => {
      mockPrisma.donation.findFirst.mockResolvedValue(null);

      const result = await validator.checkDonationDuplicate('paypal', 'tx_456');

      expect(result).toHaveLength(0);
    });
  });

  describe('validateNoDuplicates', () => {
    it('should throw error when duplicates exist', async () => {
      const checkResults = [
        { isDuplicate: true, field: 'email', value: 'test@example.com' },
      ];

      await expect(validator.validateNoDuplicates(checkResults)).rejects.toThrow(
        'Duplicate validation failed: User with email test@example.com already exists'
      );
    });

    it('should not throw error when no duplicates exist', async () => {
      const checkResults = [
        { isDuplicate: false, field: 'email', value: 'test@example.com' },
      ];

      await expect(validator.validateNoDuplicates(checkResults)).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      await expect(validator.checkUserDuplicate('test@example.com')).rejects.toThrow(
        'Database error'
      );
    });
  });
});
