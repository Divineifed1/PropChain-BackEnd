import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService, AuditOperation } from './audit.service';
import { ConsentType, GdprRequestType, GdprRequestStatus } from '../dto/compliance.dto';
import { v4 as uuidv4 } from 'uuid';

export interface UserDataExport {
  user: any;
  properties: any[];
  transactions: any[];
  documents: any[];
  auditLogs: any[];
}

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);
  private readonly gdprDeadlineDays: number = 30; // GDPR requires response within 30 days

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Export all personal data for a specific user (Right to Data Portability)
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    // Fetch user data
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Fetch related data
    const [properties, transactions, documents, auditLogs] = await Promise.all([
      this.prisma.property.findMany({
        where: { ownerId: userId },
      }),
      this.prisma.transaction.findMany({
        where: {
          OR: [{ fromAddress: user.walletAddress }, { toAddress: user.walletAddress }],
        },
      }),
      this.prisma.document.findMany({
        where: { uploadedById: userId },
      }),
      this.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 1000, // Limit to prevent huge exports
      }),
    ]);

    // Sanitize sensitive data before export
    const sanitizedUser = this.sanitizeUserData(user);

    await this.auditService.logAction({
      tableName: 'users',
      operation: AuditOperation.READ,
      newData: { action: 'GDPR_DATA_EXPORT', userId },
      userId,
    });

    return {
      user: sanitizedUser,
      properties,
      transactions,
      documents,
      auditLogs,
    };
  }

  /**
   * Delete user data (Right to be Forgotten)
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Log the deletion before it happens
    await this.auditService.logDelete('users', user, userId);

    // Perform soft delete or hard delete based on compliance requirements
    // For financial/real estate applications, we may want to preserve records for legal reasons
    // So we'll anonymize the user instead of completely deleting

    await this.prisma.$transaction(async (tx: any) => {
      // Anonymize user data (keep for legal compliance but remove personal info)
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@example.com`,
          walletAddress: null,
          password: null,
          isVerified: false,
        },
      });

      // For documents, we might want to anonymize or mark as deleted
      await tx.document.updateMany({
        where: { uploadedById: userId },
        data: {
          name: '[ANONYMIZED]',
          fileUrl: '[REDACTED]',
          description: '[REDACTED]',
        },
      });

      // Add an audit log entry for the GDPR deletion
      await tx.auditLog.create({
        data: {
          tableName: 'users',
          operation: 'GDPR_DELETE',
          oldData: { id: userId, email: user.email },
          newData: { action: 'GDPR_RIGHT_TO_FORGET', anonymized: true },
          userId,
          timestamp: new Date(),
        },
      });
    });
  }

  /**
   * Anonymize user data completely (hard delete alternative)
   */
  async anonymizeUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    await this.prisma.$transaction(async (tx: any) => {
      // Store original data for audit before anonymization
      const originalData = {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
        role: user.role,
      };

      // Anonymize the user record
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `anonymized-${userId}`,
          walletAddress: null,
          password: null,
          isVerified: false,
          // Keep role for system functionality but anonymize
        },
      });

      // Anonymize related records where possible
      await tx.property.updateMany({
        where: { ownerId: userId },
        data: {
          title: '[ANONYMIZED PROPERTY]',
          description: '[REDACTED FOR PRIVACY]',
          location: '[REDACTED]',
        },
      });

      await tx.document.updateMany({
        where: { uploadedById: userId },
        data: {
          name: '[ANONYMIZED DOCUMENT]',
          fileUrl: '[REDACTED]',
          description: '[REDACTED]',
        },
      });

      // Log the anonymization action
      await this.auditService.logAction({
        tableName: 'users',
        operation: AuditOperation.UPDATE,
        oldData: originalData,
        newData: { id: userId, status: 'ANONYMIZED' },
        userId,
      });
    });
  }

  /**
   * Get user's consent preferences
   */
  async getUserConsents(userId: string) {
    const consents = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
    });

    return consents.map((consent: any) => ({
      type: consent.consentType as ConsentType,
      granted: consent.granted,
      grantedAt: consent.grantedAt,
      withdrawnAt: consent.withdrawnAt,
      version: consent.version,
    }));
  }

  /**
   * Update user's consent preferences with full audit trail
   */
  async updateUserConsent(
    userId: string,
    consentTypes: ConsentType[],
    granted: boolean,
    metadata?: { ipAddress?: string; userAgent?: string; notes?: string },
  ): Promise<{ success: boolean; userId: string; consents: any[] }> {
    this.logger.log(`Updating consent for user ${userId}: ${consentTypes.join(', ')} - ${granted ? 'GRANTED' : 'WITHDRAWN'}`);

    const updatedConsents = await this.prisma.$transaction(async (tx: any) => {
      const results = [];

      for (const consentType of consentTypes) {
        const existingConsent = await tx.consent.findUnique({
          where: {
            userId_consentType: {
              userId,
              consentType,
            },
          },
        });

        if (existingConsent && granted) {
          // Update existing consent
          const updated = await tx.consent.update({
            where: { id: existingConsent.id },
            data: {
              granted: true,
              grantedAt: new Date(),
              withdrawnAt: null,
              ipAddress: metadata?.ipAddress,
              userAgent: metadata?.userAgent,
              notes: metadata?.notes,
            },
          });
          results.push(updated);
        } else if (existingConsent && !granted) {
          // Withdraw consent
          const updated = await tx.consent.update({
            where: { id: existingConsent.id },
            data: {
              granted: false,
              withdrawnAt: new Date(),
              ipAddress: metadata?.ipAddress,
              userAgent: metadata?.userAgent,
              notes: metadata?.notes || 'Consent withdrawn',
            },
          });
          results.push(updated);
        } else if (!existingConsent && granted) {
          // Create new consent
          const created = await tx.consent.create({
            data: {
              id: uuidv4(),
              userId,
              consentType,
              granted: true,
              grantedAt: new Date(),
              ipAddress: metadata?.ipAddress,
              userAgent: metadata?.userAgent,
              notes: metadata?.notes || 'Initial consent granted',
            },
          });
          results.push(created);
        }
      }

      // Log audit for each consent update
      for (const consent of results) {
        await tx.auditLog.create({
          data: {
            tableName: 'consents',
            operation: granted ? AuditOperation.CREATE : AuditOperation.UPDATE,
            newData: {
              action: 'CONSENT_UPDATE',
              userId,
              consentType: consent.consentType,
              granted: consent.granted,
            },
            userId,
            timestamp: new Date(),
          },
        });
      }

      return results;
    });

    this.logger.log(`Consent updated successfully for user ${userId}`);

    return {
      success: true,
      userId,
      consents: updatedConsents.map((c: any) => ({
        type: c.consentType,
        granted: c.granted,
        grantedAt: c.grantedAt,
        withdrawnAt: c.withdrawnAt,
        version: c.version,
      })),
    };
  }

  /**
   * Initiate GDPR request with 30-day deadline tracking
   */
  async initiateGdprRequest(
    userId: string,
    requestType: GdprRequestType,
    details?: string,
    fields?: string[],
  ): Promise<{ requestId: string; expectedCompletionDate: Date }> {
    this.logger.log(`Initiating GDPR request for user ${userId}: ${requestType}`);

    const expectedCompletionDate = new Date();
    expectedCompletionDate.setDate(expectedCompletionDate.getDate() + this.gdprDeadlineDays);

    const gdprRequest = await this.prisma.gdprRequest.create({
      data: {
        id: uuidv4(),
        userId,
        requestType,
        status: GdprRequestStatus.PENDING,
        details,
        fields: fields || [],
        expectedCompletionDate,
        createdAt: new Date(),
      },
    });

    // Log audit
    await this.auditService.logAction({
      tableName: 'gdpr_requests',
      operation: AuditOperation.CREATE,
      newData: {
        action: 'GDPR_REQUEST_INITIATED',
        userId,
        requestId: gdprRequest.id,
        requestType,
        expectedCompletionDate,
      },
      userId,
    });

    this.logger.log(`GDPR request created: ${gdprRequest.id}, due by: ${expectedCompletionDate.toISOString()}`);

    return {
      requestId: gdprRequest.id,
      expectedCompletionDate,
    };
  }

  /**
   * Complete GDPR request
   */
  async completeGdprRequest(requestId: string, resultData?: any): Promise<void> {
    this.logger.log(`Completing GDPR request: ${requestId}`);

    await this.prisma.gdprRequest.update({
      where: { id: requestId },
      data: {
        status: GdprRequestStatus.COMPLETED,
        completedAt: new Date(),
        resultData,
      },
    });

    // Log audit
    const request = await this.prisma.gdprRequest.findUnique({
      where: { id: requestId },
    });

    if (request) {
      await this.auditService.logAction({
        tableName: 'gdpr_requests',
        operation: AuditOperation.UPDATE,
        newData: {
          action: 'GDPR_REQUEST_COMPLETED',
          requestId,
          completedAt: new Date(),
        },
        userId: request.userId,
      });
    }

    this.logger.log(`GDPR request completed: ${requestId}`);
  }

  /**
   * Fail GDPR request with reason
   */
  async failGdprRequest(requestId: string, failureReason: string): Promise<void> {
    this.logger.error(`Failing GDPR request: ${requestId}, reason: ${failureReason}`);

    await this.prisma.gdprRequest.update({
      where: { id: requestId },
      data: {
        status: GdprRequestStatus.FAILED,
        failureReason,
        completedAt: new Date(),
      },
    });

    // Log audit
    const request = await this.prisma.gdprRequest.findUnique({
      where: { id: requestId },
    });

    if (request) {
      await this.auditService.logAction({
        tableName: 'gdpr_requests',
        operation: AuditOperation.UPDATE,
        newData: {
          action: 'GDPR_REQUEST_FAILED',
          requestId,
          failureReason,
        },
        userId: request.userId,
      });
    }
  }

  /**
   * Get pending GDPR requests approaching deadline
   */
  async getUrgentGdprRequests(daysUntilDeadline: number = 7): Promise<any[]> {
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + daysUntilDeadline);

    const urgentRequests = await this.prisma.gdprRequest.findMany({
      where: {
        status: GdprRequestStatus.IN_PROGRESS,
        expectedCompletionDate: {
          lte: deadlineDate,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
      orderBy: {
        expectedCompletionDate: 'asc',
      },
    });

    this.logger.warn(`Found ${urgentRequests.length} urgent GDPR requests approaching deadline`);

    return urgentRequests;
  }

  /**
   * Get GDPR request statistics
   */
  async getGdprRequestStats(): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    overdue: number;
  }> {
    const [total, pending, inProgress, completed, failed] = await Promise.all([
      this.prisma.gdprRequest.count(),
      this.prisma.gdprRequest.count({ where: { status: GdprRequestStatus.PENDING } }),
      this.prisma.gdprRequest.count({ where: { status: GdprRequestStatus.IN_PROGRESS } }),
      this.prisma.gdprRequest.count({ where: { status: GdprRequestStatus.COMPLETED } }),
      this.prisma.gdprRequest.count({ where: { status: GdprRequestStatus.FAILED } }),
    ]);

    const now = new Date();
    const overdue = await this.prisma.gdprRequest.count({
      where: {
        status: {
          in: [GdprRequestStatus.PENDING, GdprRequestStatus.IN_PROGRESS],
        },
        expectedCompletionDate: {
          lt: now,
        },
      },
    });

    return { total, pending, inProgress, completed, failed, overdue };
  }

  /**
   * Sanitize user data to remove sensitive information for export
   */
  private sanitizeUserData(user: any): any {
    const sanitized = { ...user };

    // Remove sensitive fields that shouldn't be exported
    delete sanitized.password;
    delete sanitized.twoFactorSecret;
    delete sanitized.refreshToken;

    return sanitized;
  }

  /**
   * Check if user data has been anonymized
   */
  async isUserAnonymized(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        walletAddress: true,
      },
    });

    if (!user) {
      return true; // User doesn't exist, so it's anonymized
    }

    // Check if user has been anonymized
    return user.email?.startsWith('anonymized-') || user.email?.startsWith('deleted-') || user.walletAddress === null;
  }
}
