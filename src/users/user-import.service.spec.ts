import { UserImportService } from './user-import.service';
import { ConfigService } from '@nestjs/config';
import { ActivityLogService } from './activity-log.service';

function buildHarness() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (queries: unknown[]) => queries.map(() => ({}))),
  } as unknown as any;

  const configService = new ConfigService({
    PASSWORD_MIN_LENGTH: '8',
    PASSWORD_REQUIRE_UPPERCASE: 'true',
    PASSWORD_REQUIRE_LOWERCASE: 'true',
    PASSWORD_REQUIRE_DIGIT: 'true',
    PASSWORD_REQUIRE_SPECIAL: 'true',
  });

  const activityLogService = {
    create: jest.fn().mockResolvedValue({}),
  } as unknown as ActivityLogService;

  const service = new UserImportService(prisma, configService, activityLogService);
  return { service, prisma, activityLogService };
}

const CSV_HEADER = 'email,firstName,lastName,password,role,phone\n';

function csvRow(row = 'new.user@example.com,New,User,StrongPass1!,USER,5551234567'): Buffer {
  return Buffer.from(CSV_HEADER + row + '\n');
}

describe('UserImportService – password policy (#1199) and role whitelist (#1198)', () => {
  it('accepts a row that satisfies the full password policy', async () => {
    const { service, prisma } = buildHarness();
    const report = await service.importFromCsv(
      csvRow('policy.ok@example.com,New,User,StrongPass1!,USER,555'),
    );

    expect(report.success).toBe(1);
    expect(report.failed).toBe(0);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('rejects a weak password and reports it per-row without failing the whole import', async () => {
    const { service, prisma } = buildHarness();
    const report = await service.importFromCsv(
      csvRow('weak@example.com,New,User,password123,USER,'),
    );

    expect(report.failed).toBe(1);
    expect(report.success).toBe(0);
    expect(report.errors[0]).toEqual(
      expect.objectContaining({
        row: 2,
        email: 'weak@example.com',
        error: expect.stringContaining('Password does not meet policy'),
      }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('reports every password-policy violation for an invalid row', async () => {
    const { service } = buildHarness();
    // No uppercase, no digit → both violations collected
    const report = await service.importFromCsv(
      csvRow('bad@example.com,New,User,lowercasespecial!,USER,'),
    );

    expect(report.failed).toBe(1);
    expect(report.errors[0].error).toContain('uppercase');
    expect(report.errors[0].error).toContain('digit');
  });

  it('rejects role=ADMIN rows as not importable', async () => {
    const { service, prisma } = buildHarness();
    const report = await service.importFromCsv(
      csvRow('admin.spoof@example.com,New,User,StrongPass1!,ADMIN,'),
    );

    expect(report.failed).toBe(1);
    expect(report.success).toBe(0);
    expect(report.errors[0].error).toContain('not importable');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('accepts AGENT role but rejects unknown roles', async () => {
    const { service, prisma } = buildHarness();
    prisma.user.findUnique.mockResolvedValueOnce(null);

    const okReport = await service.importFromCsv(
      csvRow('agent@example.com,New,Agent,StrongPass1!,AGENT,'),
    );
    expect(okReport.success).toBe(1);

    const badReport = await service.importFromCsv(
      csvRow('super.spoof@example.com,New,User,StrongPass1!,SUPERADMIN,'),
    );
    expect(badReport.failed).toBe(1);
    expect(badReport.errors[0].error).toContain('not importable');
  });

  it('writes an audit entry naming the actor when provided', async () => {
    const { service, activityLogService } = buildHarness();
    await service.importFromCsv(csvRow(), {
      id: 'actor-1',
      email: 'admin@example.com',
    });

    expect(activityLogService.create).toHaveBeenCalledWith(
      'actor-1',
      expect.objectContaining({
        action: 'USER_IMPORT',
        entityType: 'USER',
        description: expect.stringContaining('user import'),
      }),
    );
  });

  it('does not fail the import when the audit write fails', async () => {
    const { service, activityLogService } = buildHarness();
    (activityLogService.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));

    const report = await service.importFromCsv(csvRow(), {
      id: 'actor-1',
      email: 'admin@example.com',
    });

    expect(report.success).toBe(1);
  });
});
