export type DonationStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface Donation {
  id: string;
  provider: string;
  providerTransactionId: string;
  amount: number;
  currency: string;
  donorName?: string | null;
  donorEmail?: string | null;
  blockchainHash?: string | null;
  status: DonationStatus;
  createdAt: Date;
  updatedAt: Date;
}
