import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { I18nService } from '../i18n/i18n.service';
import { v4 as uuidv4 } from 'uuid';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { redactEmail } from '../auth/security.utils';
import { buildUnsubscribeUrl } from './unsubscribe-url.helper';

/** Number of hard bounces within the lookback window that triggers suppression. */
export const HARD_BOUNCE_SUPPRESSION_THRESHOLD = 1;
/** Lookback window for hard-bounce suppression (ms). Default 90 days. */
export const HARD_BOUNCE_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  userId?: string;
  emailType?: string;
  template?: string;
  context?: any;
  language?: string;
}

export interface FraudAlertEmailPayload {
  alertId: string;
  pattern: string;
  severity: string;
  title: string;
  description: string;
  userEmail?: string | null;
}

export interface TransactionStatusPayload {
  transactionId: string;
  propertyTitle: string;
  propertyAddress: string;
  buyerName: string;
  sellerName: string;
  amount: string;
  completionDate?: string;
  blockchainTxHash?: string;
  cancellationReason?: string;
  cancelledDate?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly trackingService: TrackingService,
    private readonly i18nService: I18nService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
  ) {}

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${resetToken}`;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset - PropChain',
      template: 'password-reset',
      context: { resetUrl },
      text: `Password Reset Request. Please use this link: ${resetUrl}`,
    });
  }

  async sendAccountLockedEmail(email: string, lockoutDuration: number): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Account Locked - PropChain',
      template: 'account-locked',
      context: { lockoutDuration },
      text: `Your account has been locked for ${lockoutDuration} minutes.`,
    });
  }

  async sendFraudAlertEmail(recipients: string[], payload: FraudAlertEmailPayload): Promise<void> {
    await Promise.all(
      recipients.map((recipient) =>
        this.sendEmail({
          to: recipient,
          subject: `[Fraud Alert][${payload.severity}] ${payload.title}`,
          template: 'fraud-alert',
          context: {
            alertId: payload.alertId,
            pattern: payload.pattern,
            severity: payload.severity,
            userEmail: payload.userEmail ?? 'Unknown',
            description: payload.description,
          },
          text: `Fraud Alert: ${payload.title}. Pattern: ${payload.pattern}. Severity: ${payload.severity}.`,
        }),
      ),
    );
  }

  async sendTransactionStatusEmail(
    email: string,
    status: string,
    payload: TransactionStatusPayload,
  ): Promise<void> {
    const templateMap: Record<string, string> = {
      PENDING: 'transaction-status-pending',
      COMPLETED: 'transaction-status-completed',
      CANCELLED: 'transaction-status-cancelled',
    };

    const template = templateMap[status];
    if (!template) {
      this.logger.warn(`No template found for transaction status: ${status}`);
      return;
    }

    await this.sendEmail({
      to: email,
      subject: `[PropChain] Transaction ${status}`,
      template,
      context: payload,
      text: `Your transaction status has been updated to ${status}. Transaction ID: ${payload.transactionId}`,
    });
  }

  async handleBounce(
    email: string,
    type: 'HARD' | 'SOFT',
    reason?: string,
    rawEvent?: any,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.emailBounce.create({
      data: {
        userId: user.id,
        email,
        bounceType: type,
        reason,
        rawEvent,
      },
    });

    if (type === 'HARD') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailStatus: 'BOUNCED' },
      });

      await this.prisma.userPreferences.upsert({
        where: { userId: user.id },
        update: { emailNotifications: false },
        create: {
          userId: user.id,
          emailNotifications: false,
        },
      });

      this.logger.warn(
        `Hard bounce processed for ${redactEmail(email)}: user marked as BOUNCED, email notifications disabled`,
      );
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailStatus: 'BOUNCED' },
      });
    }
  }

  async handleComplaint(email: string, rawEvent?: any): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.emailBounce.create({
      data: {
        userId: user.id,
        email,
        bounceType: 'HARD',
        reason: 'Spam complaint',
        rawEvent,
        spamAction: 'COMPLAINED',
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailStatus: 'BOUNCED' },
    });

    await this.prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: { emailNotifications: false },
      create: {
        userId: user.id,
        emailNotifications: false,
      },
    });

    this.logger.warn(`Spam complaint processed for ${redactEmail(email)}: user marked as BOUNCED`);
  }

  async handleUnsubscribe(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: { emailNotifications: false },
      create: {
        userId: user.id,
        emailNotifications: false,
      },
    });

    this.logger.log(`Unsubscribe processed for ${redactEmail(email)}`);
  }

  async getSenderReputation() {
    const [totalBounced, totalComplaints, totalUsers, bouncedUsers, complainedUsers] =
      await Promise.all([
        this.prisma.emailBounce.count({ where: { bounceType: 'HARD' } }),
        this.prisma.emailBounce.count({ where: { spamAction: 'COMPLAINED' } }),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { emailStatus: 'BOUNCED' } }),
        this.prisma.user.count({ where: { isBlocked: false } }),
      ]);

    const bounceRate = totalUsers > 0 ? (bouncedUsers / totalUsers) * 100 : 0;
    const complaintRate =
      totalUsers > 0 ? (complainedUsers > 0 ? (complainedUsers / totalUsers) * 100 : 0) : 0;
    const reputationScore = Math.max(0, 100 - bounceRate * 10 - complaintRate * 20);

    return {
      totals: {
        totalUsers,
        bouncedUsers,
        totalBouncedEvents: totalBounced,
        totalComplaints,
      },
      rates: {
        bounceRate: Math.round(bounceRate * 100) / 100,
        complaintRate: Math.round(complaintRate * 100) / 100,
      },
      reputationScore: Math.round(reputationScore * 100) / 100,
      health: reputationScore >= 90 ? 'GOOD' : reputationScore >= 70 ? 'FAIR' : 'POOR',
    };
  }

  buildListUnsubscribeHeader(userId?: string, email?: string): string | null {
    if (!userId || !email) return null;
    const token = Buffer.from(`${userId}:${email}`).toString('base64');
    // Read FRONTEND_URL at call time via ConfigService so tests and multi-tenant
    // overrides are not stuck with a module-load snapshot (issue #1232).
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    try {
      const url = buildUnsubscribeUrl(token, frontendUrl);
      return `<${url}>`;
    } catch {
      this.logger.warn('FRONTEND_URL not set; omitting List-Unsubscribe header');
      return null;
    }
  }

  /**
   * Returns true when the address has recent hard bounces / complaints at or
   * above HARD_BOUNCE_SUPPRESSION_THRESHOLD (issue #1233).
   */
  async shouldSuppressAddress(email: string): Promise<boolean> {
    const since = new Date(Date.now() - HARD_BOUNCE_LOOKBACK_MS);
    const hardCount = await this.prisma.emailBounce.count({
      where: {
        email,
        bounceType: 'HARD',
        createdAt: { gte: since },
      },
    });
    if (hardCount >= HARD_BOUNCE_SUPPRESSION_THRESHOLD) {
      return true;
    }
    const complaints = await this.prisma.emailBounce.count({
      where: {
        email,
        spamAction: 'COMPLAINED',
        createdAt: { gte: since },
      },
    });
    return complaints >= HARD_BOUNCE_SUPPRESSION_THRESHOLD;
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:3000/api');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const html = options.html;

    // Issue #1231 – resolve i18n strings for the requested language into context.t
    // so EJS templates render localized copy instead of hard-coded English.
    const lang =
      options.language === 'es' || options.language === 'en'
        ? options.language
        : this.i18nService.resolveLanguage({ userPreference: options.language });
    options.language = lang;
    const t = this.buildEmailTranslations(lang, options.context ?? {});
    options.context = {
      ...(options.context ?? {}),
      t,
      language: lang,
    };
    if (options.template && (!options.subject || options.subject.startsWith('['))) {
      // Prefer catalogue subject when available
      const subjectKey = this.subjectKeyForTemplate(options.template, options.context);
      if (subjectKey) {
        const subject = this.i18nService.tFor(
          subjectKey,
          lang as 'en' | 'es',
          options.context as any,
        );
        if (subject !== subjectKey) {
          options.subject = subject;
        }
      }
    }

    // 0. Bounce / complaint suppression (issue #1233)
    if (await this.shouldSuppressAddress(options.to)) {
      this.logger.warn(
        `🚫 Skipping email to ${redactEmail(options.to)} (hard-bounce or complaint suppression)`,
      );
      return;
    }

    // 1. Check if user is blocked or has invalid / bounced email
    if (options.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: options.userId } });
      if (
        user &&
        (user.isBlocked || user.emailStatus === 'INVALID' || user.emailStatus === 'BOUNCED')
      ) {
        this.logger.warn(
          `🚫 Skipping email to ${redactEmail(options.to)} (User blocked or email invalid/bounced)`,
        );
        return;
      }
    }

    // 2. Open Tracking: Inject pixel (only if we have a userId and emailType)
    // Note: If using templates, tracking usually needs to be handled in the template or post-render.
    // For simplicity in this implementation, we'll pass the tracking info to the context.
    if (options.userId && options.emailType) {
      const trackingId = uuidv4();
      await this.trackingService.createEmailEngagement(
        options.userId,
        options.emailType,
        trackingId,
      );

      const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:3000/api');
      const pixelUrl = `${baseUrl}/track/open/${trackingId}.png`;

      options.context = {
        ...options.context,
        trackingPixel: pixelUrl,
        userId: options.userId,
      };
    }

    // 3. Add to Queue
    try {
      const listUnsubscribe = this.buildListUnsubscribeHeader(options.userId, options.to);

      await this.mailQueue.add(
        'sendEmail',
        {
          to: options.to,
          subject: options.subject,
          template: options.template,
          context: options.context,
          html: options.html,
          text: options.text,
          headers: {
            ...(listUnsubscribe ? { 'List-Unsubscribe': listUnsubscribe } : {}),
          },
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      this.logger.log(
        `📧 Email to ${redactEmail(options.to)} queued for subject: ${options.subject}`,
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`❌ Failed to queue email to ${redactEmail(options.to)}: ${error.message}`);
      throw error;
    }
  }

  async sendLocalizedEmail(
    to: string,
    templateKey: string,
    userId: string,
    params?: Record<string, string | number>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { languagePreference: true },
    });

    const language = user?.languagePreference || 'en';
    const translated = this.i18nService.translate(
      templateKey,
      { userPreference: language },
      params,
    );

    await this.sendEmail({
      to,
      subject: translated,
      template: templateKey.replace('.', '-'),
      context: params,
      userId,
      language,
    });
  }
  /**
   * Build a flat map of email.* strings for the given language so templates
   * can render via <%= t.password_reset_title %> etc. (issue #1231).
   */
  private buildEmailTranslations(
    lang: string,
    params: Record<string, unknown>,
  ): Record<string, string> {
    const supported = lang === 'es' ? 'es' : 'en';
    const keys = [
      'password_reset_subject',
      'password_reset_title',
      'password_reset_body',
      'password_reset_cta',
      'password_reset_ignore',
      'password_reset_expiry',
      'account_locked_subject',
      'account_locked_title',
      'account_locked_body',
      'account_locked_duration',
      'account_locked_advice',
      'fraud_alert_subject',
      'fraud_alert_title',
      'fraud_alert_summary',
      'transaction_status_subject',
      'transaction_pending_title',
      'transaction_pending_body',
      'transaction_completed_title',
      'transaction_completed_body',
      'transaction_cancelled_title',
      'transaction_cancelled_body',
      'data_export_ready_subject',
      'data_export_ready_greeting',
      'data_export_ready_body',
      'data_export_ready_security',
      'data_export_failed_subject',
      'data_export_failed_body',
      'regards',
      'team',
    ];
    const out: Record<string, string> = {};
    const interpolateParams: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' || typeof v === 'number') {
        interpolateParams[k] = v;
      }
    }
    for (const key of keys) {
      out[key] = this.i18nService.tFor(`email.${key}`, supported, interpolateParams);
    }
    return out;
  }

  private subjectKeyForTemplate(
    template: string,
    _context: Record<string, unknown>,
  ): string | null {
    const map: Record<string, string> = {
      'password-reset': 'email.password_reset_subject',
      'account-locked': 'email.account_locked_subject',
      'fraud-alert': 'email.fraud_alert_subject',
      'transaction-status-pending': 'email.transaction_status_subject',
      'transaction-status-completed': 'email.transaction_status_subject',
      'transaction-status-cancelled': 'email.transaction_status_subject',
    };
    return map[template] ?? null;
  }
}
