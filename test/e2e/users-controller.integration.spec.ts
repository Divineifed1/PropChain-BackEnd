/**
 * Integration tests: UsersController over HTTP.
 *
 * Real controller, Nest HTTP stack and the same global ValidationPipe settings as
 * main.ts, with mocked services and a role-aware test guard. Covers status codes,
 * validation, role enforcement and argument passing without a database.
 */

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { ActivityLogService } from '../../src/users/activity-log.service';
import { AccountDeletionService } from '../../src/users/account-deletion.service';
import { DataExportService } from '../../src/users/data-export.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';

/** "Authorization: Bearer role:ADMIN" / "role:USER"; anything else is rejected. */
@Injectable()
class RoleTestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer role:')) return false;
    const role = header.slice('Bearer role:'.length);
    req.authUser = { sub: `${role.toLowerCase()}-1`, email: `${role}@example.com`, role, type: 'access' };
    return true;
  }
}

/** Admin-only routes: allow only the ADMIN role (stands in for RolesGuard + @Roles). */
@Injectable()
class AdminOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    return ctx.switchToHttp().getRequest().authUser?.role === 'ADMIN';
  }
}

describe('UsersController (integration)', () => {
  let app: INestApplication;
  const usersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    search: jest.fn(),
    getUserStatistics: jest.fn(),
    getLoginHistory: jest.fn(),
  };

  const asAdmin = (r: request.Test) => r.set('Authorization', 'Bearer role:ADMIN');
  const asUser = (r: request.Test) => r.set('Authorization', 'Bearer role:USER');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: ActivityLogService, useValue: {} },
        { provide: AccountDeletionService, useValue: {} },
        { provide: DataExportService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RoleTestGuard)
      .overrideGuard(RolesGuard)
      .useClass(AdminOnlyGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // Same settings as src/main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('authentication and roles', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/users').expect(403);
      expect(usersService.findAll).not.toHaveBeenCalled();
    });

    it('rejects a USER from admin routes', async () => {
      await asUser(request(app.getHttpServer()).get('/users')).expect(403);
      expect(usersService.findAll).not.toHaveBeenCalled();
    });

    it('lets an ADMIN list users', async () => {
      usersService.findAll.mockResolvedValue([{ id: 'u1' }]);
      const res = await asAdmin(request(app.getHttpServer()).get('/users')).expect(200);
      expect(res.body).toEqual([{ id: 'u1' }]);
    });
  });

  describe('GET /users/:id', () => {
    it('returns the user', async () => {
      usersService.findOne.mockResolvedValue({ id: 'u1', email: 'a@example.com' });
      const res = await asAdmin(request(app.getHttpServer()).get('/users/u1')).expect(200);
      expect(res.body).toEqual({ id: 'u1', email: 'a@example.com' });
      expect(usersService.findOne).toHaveBeenCalledWith('u1');
    });

    it('answers 404 instead of an empty 200 when the user does not exist', async () => {
      usersService.findOne.mockResolvedValue(null);
      await asAdmin(request(app.getHttpServer()).get('/users/missing')).expect(404);
    });
  });

  describe('POST /users', () => {
    const valid = {
      email: 'new@example.com',
      password: 'Str0ng!Pass',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    it('creates a user for an ADMIN', async () => {
      usersService.create.mockResolvedValue({ id: 'u2', email: valid.email });
      await asAdmin(request(app.getHttpServer()).post('/users').send(valid)).expect(201);
      expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({ email: valid.email }));
    });

    it('rejects an invalid body with 400', async () => {
      await asAdmin(
        request(app.getHttpServer()).post('/users').send({ ...valid, email: 'nope', password: 'short' }),
      ).expect(400);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('rejects unknown fields with 400 (forbidNonWhitelisted)', async () => {
      await asAdmin(request(app.getHttpServer()).post('/users').send({ ...valid, role: 'ADMIN' })).expect(400);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('is forbidden for a USER', async () => {
      await asUser(request(app.getHttpServer()).post('/users').send(valid)).expect(403);
    });
  });

  describe('GET /users/search', () => {
    it('coerces page and limit to numbers', async () => {
      usersService.search.mockResolvedValue({ data: [], meta: {} });
      await asAdmin(request(app.getHttpServer()).get('/users/search?q=ada&page=2&limit=5')).expect(200);
      expect(usersService.search).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'ada', page: 2, limit: 5 }),
      );
    });

    it('rejects a non-numeric page with 400', async () => {
      await asAdmin(request(app.getHttpServer()).get('/users/search?page=abc')).expect(400);
      expect(usersService.search).not.toHaveBeenCalled();
    });

    it('rejects page 0 with 400', async () => {
      await asAdmin(request(app.getHttpServer()).get('/users/search?page=0')).expect(400);
    });
  });

  describe('PUT /users/:id', () => {
    it('updates with a valid partial body', async () => {
      usersService.update.mockResolvedValue({ id: 'u1', firstName: 'Grace' });
      await asAdmin(request(app.getHttpServer()).put('/users/u1').send({ firstName: 'Grace' })).expect(200);
      expect(usersService.update).toHaveBeenCalledWith('u1', expect.objectContaining({ firstName: 'Grace' }));
    });

    it('rejects an invalid email with 400', async () => {
      await asAdmin(request(app.getHttpServer()).put('/users/u1').send({ email: 'bad' })).expect(400);
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  describe('self-service routes', () => {
    it('GET /users/me/statistics uses the caller id', async () => {
      usersService.getUserStatistics.mockResolvedValue({ propertiesCount: 2 });
      await asUser(request(app.getHttpServer()).get('/users/me/statistics')).expect(200);
      expect(usersService.getUserStatistics).toHaveBeenCalledWith('user-1');
    });

    it('GET /users/me/login-history uses the caller id', async () => {
      usersService.getLoginHistory.mockResolvedValue([]);
      await asUser(request(app.getHttpServer()).get('/users/me/login-history')).expect(200);
      expect(usersService.getLoginHistory).toHaveBeenCalledWith('user-1');
    });

    it('self-service routes require authentication', async () => {
      await request(app.getHttpServer()).get('/users/me/statistics').expect(403);
    });
  });
});
