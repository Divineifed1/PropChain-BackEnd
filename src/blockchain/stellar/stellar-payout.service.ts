import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigEncryptionUtil } from '../../config/utils/config.encryption';

/**
 * Stellar network type
 */
export enum StellarNetwork {
  PUBLIC = 'public',
  TESTNET = 'testnet',
}

/**
 * Payment transaction result
 */
export interface PaymentTransactionResult {
  success: boolean;
  transactionHash?: string;
  amount: string;
  destination: string;
  fee: string;
  error?: string;
}

/**
 * Platform account info
 */
export interface PlatformAccountInfo {
  publicKey: string;
  balance: string;
}

/**
 * Service for handling Stellar blockchain payouts to creators
 */
@Injectable()
export class StellarPayoutService {
  private readonly logger = new Logger(StellarPayoutService.name);
  private readonly network: StellarNetwork;
  private readonly baseFee: number;
  private readonly timeout: number;
  private stellarServer: any;
  private platformKeyPair: any;

  constructor(private readonly configService: ConfigService) {
    this.network = this.configService.get<StellarNetwork>(
      'STELLAR_NETWORK',
      StellarNetwork.TESTNET,
    );
    this.baseFee = this.configService.get<number>('STELLAR_BASE_FEE', 100);
    this.timeout = this.configService.get<number>('STELLAR_TIMEOUT', 30000);
  }

  /**
   * Initialize Stellar connection and load platform account
   * This should be called on module initialization
   */
  async onModuleInit(): Promise<void> {
    await this.initializeStellar();
  }

  /**
   * Initialize Stellar SDK and load platform keypair
   */
  private async initializeStellar(): Promise<void> {
    try {
      // Dynamic import to avoid issues if stellar-sdk is not installed
      const Stellar = await import('stellar-sdk');

      // Configure network
      const networkPassphrase =
        this.network === StellarNetwork.TESTNET
          ? Stellar.Networks.TESTNET
          : Stellar.Networks.PUBLIC;

      // Initialize Horizon server
      const horizonUrl =
        this.network === StellarNetwork.TESTNET
          ? 'https://horizon-testnet.stellar.org'
          : 'https://horizon.stellar.org';

      this.stellarServer = new Stellar.Horizon.Server(horizonUrl, {
        timeout: this.timeout,
      });

      // Load platform secret key from config (encrypted)
      const encryptedSecret = this.configService.get<string>(
        'STELLAR_SECRET_KEY',
      );

      if (!encryptedSecret) {
        this.logger.warn(
          'STELLAR_SECRET_KEY not configured. Payouts will not be available.',
        );
        return;
      }

      // Decrypt the secret key
      const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
      let secretKey: string;

      if (encryptionKey && ConfigEncryptionUtil.isEncrypted(encryptedSecret)) {
        secretKey = ConfigEncryptionUtil.decrypt(encryptedSecret, encryptionKey);
      } else {
        secretKey = encryptedSecret;
      }

      // Create keypair from secret
      this.platformKeyPair = Stellar.Keypair.fromSecret(secretKey);

      this.logger.log(
        `Stellar initialized with network: ${this.network}, platform address: ${this.platformKeyPair.publicKey()}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize Stellar', error);
      throw new InternalServerErrorException(
        'Stellar initialization failed',
      );
    }
  }

  /**
   * Get platform account information
   */
  async getPlatformAccountInfo(): Promise<PlatformAccountInfo> {
    if (!this.platformKeyPair || !this.stellarServer) {
      throw new InternalServerErrorException('Stellar not initialized');
    }

    try {
      const account = await this.stellarServer.loadAccount(
        this.platformKeyPair.publicKey(),
      );

      const balance = account.balances.find(
        (b: any) => b.asset_type === 'native',
      );

      return {
        publicKey: this.platformKeyPair.publicKey(),
        balance: balance ? balance.balance : '0',
      };
    } catch (error) {
      this.logger.error('Failed to load platform account', error);
      throw new InternalServerErrorException(
        'Failed to load platform account',
      );
    }
  }

  /**
   * Validate a Stellar address
   */
  validateStellarAddress(address: string): boolean {
    try {
      const Stellar = require('stellar-sdk');
      Stellar.Keypair.fromPublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build and submit a payment transaction
   * @param destination - Recipient's Stellar public key
   * @param amount - Amount in XLM (string to avoid floating point issues)
   * @param memo - Optional memo for the transaction
   */
  async sendPayment(
    destination: string,
    amount: string,
    memo?: string,
  ): Promise<PaymentTransactionResult> {
    if (!this.platformKeyPair || !this.stellarServer) {
      throw new InternalServerErrorException('Stellar not initialized');
    }

    // Validate destination address
    if (!this.validateStellarAddress(destination)) {
      throw new BadRequestException('Invalid Stellar destination address');
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    try {
      // Import Stellar SDK
      const Stellar = await import('stellar-sdk');

      // Load platform account
      const sourceAccount = await this.stellarServer.loadAccount(
        this.platformKeyPair.publicKey(),
      );

      // Build transaction
      const transaction = new Stellar.TransactionBuilder(sourceAccount, {
        fee: this.baseFee.toString(),
        networkPassphrase:
          this.network === StellarNetwork.TESTNET
            ? Stellar.Networks.TESTNET
            : Stellar.Networks.PUBLIC,
      }).addOperation(
        Stellar.Operation.payment({
          destination: destination,
          asset: Stellar.Asset.native(),
          amount: amount,
        }),
      );

      // Add memo if provided
      if (memo) {
        transaction.addMemo(Stellar.Memo.text(memo.substring(0, 28))); // Max 28 chars
      }

      // Set transaction timeout
      const timeout = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      transaction.setTimeout(timeout);

      // Sign and submit
      const builtTransaction = transaction.build();
      builtTransaction.sign(this.platformKeyPair);

      const result = await this.stellarServer.submitTransaction(
        builtTransaction,
      );

      this.logger.log(
        `Payment sent: ${amount} XLM to ${destination}, hash: ${result.hash}`,
      );

      return {
        success: true,
        transactionHash: result.hash,
        amount,
        destination,
        fee: (this.baseFee / 10000000).toFixed(7), // Convert stroops to XLM
      };
    } catch (error: any) {
      this.logger.error(`Payment failed: ${error.message}`, error);

      return {
        success: false,
        amount,
        destination,
        fee: '0',
        error: error.message || 'Transaction failed',
      };
    }
  }

  /**
   * Build a payment transaction without submitting
   * Useful for previewing transaction details
   */
  async buildTransaction(
    destination: string,
    amount: string,
    memo?: string,
  ): Promise<{
    fee: string;
    source: string;
    destination: string;
    amount: string;
    memo?: string;
  }> {
    if (!this.platformKeyPair || !this.stellarServer) {
      throw new InternalServerErrorException('Stellar not initialized');
    }

    const Stellar = await import('stellar-sdk');

    const sourceAccount = await this.stellarServer.loadAccount(
      this.platformKeyPair.publicKey(),
    );

    const transaction = new Stellar.TransactionBuilder(sourceAccount, {
      fee: this.baseFee.toString(),
      networkPassphrase:
        this.network === StellarNetwork.TESTNET
          ? Stellar.Networks.TESTNET
          : Stellar.Networks.PUBLIC,
    }).addOperation(
      Stellar.Operation.payment({
        destination,
        asset: Stellar.Asset.native(),
        amount,
      }),
    );

    if (memo) {
      transaction.addMemo(Stellar.Memo.text(memo.substring(0, 28)));
    }

    const timeout = Math.floor(Date.now() / 1000) + 300;
    transaction.setTimeout(timeout);

    const builtTransaction = transaction.build();

    return {
      fee: (this.baseFee / 10000000).toFixed(7),
      source: this.platformKeyPair.publicKey(),
      destination,
      amount,
      memo: memo?.substring(0, 28),
    };
  }

  /**
   * Get transaction status from Stellar network
   */
  async getTransactionStatus(transactionHash: string): Promise<{
    status: string;
    ledger: number;
    createdAt: string;
    fee: string;
  }> {
    if (!this.stellarServer) {
      throw new InternalServerErrorException('Stellar not initialized');
    }

    try {
      const transaction = await this.stellarServer.transactions().transaction(
        transactionHash,
      );

      return {
        status: transaction.status,
        ledger: transaction.ledger,
        createdAt: transaction.created_at,
        fee: (parseInt(transaction.fee_charged) / 10000000).toFixed(7),
      };
    } catch (error: any) {
      this.logger.error(`Failed to get transaction status: ${error.message}`);
      throw new BadRequestException('Transaction not found');
    }
  }

  /**
   * Check if Stellar service is ready for payouts
   */
  isReady(): boolean {
    return !!(this.platformKeyPair && this.stellarServer);
  }
}