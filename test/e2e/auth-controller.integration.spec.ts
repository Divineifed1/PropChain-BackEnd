/**
 * Integration tests: AuthController over HTTP.
 *
 * Boots the real controller with Nest's HTTP stack, the same global
 * ValidationPipe settings as main.ts, and mocked service/guards, so request
 * parsing, validation, guard wiring and argument passing are exercised without
 * a database.
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
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { ApiKeyAnalyticsService } from '../../src/auth/api-key-analytics.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { FreshTwoFactorGuard } from '../../src/auth/guards/fresh-two-factor.guard';
import { ApiKeyAuthGuard } from '../../src/auth/guards/api-key-auth.guard';
import { KeyPermissionsGuard } from '../../src/auth/guards/key-permissions.guard';
import { GoogleAuthGuard } from '../../src/auth/guards/google-auth.guard';

/** Accepts "Authorization: Bearer test" and attaches a fixed user; rejects otherwise. */
@Injectable()
class BearerTestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['authorization'] !== 'Bearer test') return false;
    req.authUser = { sub: 'user-1', email: 'user@example.com', role: 'USER', type: 'access' };
    return true;
  }
}

describe('AuthController (integration)', () => {
  let app: INestApplication;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    me: jest.fn(),
    changePassword: jest.fn(),
    requestPasswordReset: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ApiKeyAnalyticsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(BearerTestGuard)
      .overrideGuard(RolesGuard)
      .useClass(BearerTestGuard)
      .overrideGuard(FreshTwoFactorGuard)
      .useClass(BearerTestGuard)
      .overrideGuard(ApiKeyAuthGuard)
      .useClass(BearerTestGuard)
      .overrideGuard(KeyPermissionsGuard)
      .useClass(BearerTestGuard)
      .overrideGuard(GoogleAuthGuard)
      .useClass(BearerTestGuard)
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

  describe('POST /auth/login', () => {
    it('passes the body, client address and user agent to the service', async () => {
      authService.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('User-Agent', 'jest-agent')
        .send({ email: 'user@example.com', password: 'Secret123!' })
        .expect(201);

      expect(res.body).toEqual({ accessToken: 'a', refreshToken: 'r' });
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com', password: 'Secret123!' }),
        expect.any(String),
        'jest-agent',
      );
    });

    it('rejects an invalid email with 400 and never calls the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('rejects unknown fields with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'x', isAdmin: true })
        .expect(400);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('rejects a missing password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com' })
        .expect(400);
    });
  });

  describe('POST /auth/register', () => {
    const valid = {
      email: 'new@example.com',
      password: 'Str0ng!Passw0rd',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    it('creates the account through the service', async () => {
      authService.register.mockResolvedValue({ id: 'u2', email: valid.email });

      await request(app.getHttpServer()).post('/auth/register').send(valid).expect(201);

      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({ email: valid.email, firstName: 'Ada' }),
        expect.any(String),
      );
    });

    it('rejects a weak password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...valid, password: 'short' })
        .expect(400);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('rejects a missing name with 400', async () => {
      const { firstName: _omit, ...withoutName } = valid;
      await request(app.getHttpServer()).post('/auth/register').send(withoutName).expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('forwards the refresh token', async () => {
      authService.refreshToken.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'old-token' })
        .expect(201);

      // The user agent depends on the HTTP client, so only the DTO is asserted.
      expect(authService.refreshToken.mock.calls[0][0]).toMatchObject({ refreshToken: 'old-token' });
    });

    it('requires a refresh token', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);
    });
  });

  describe('POST /auth/password-reset/request', () => {
    it('validates the email and delegates to the service', async () => {
      authService.requestPasswordReset.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'user@example.com' })
        .expect(201);
      expect(authService.requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' }),
      );

      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nope' })
        .expect(400);
    });
  });

  describe('guarded routes', () => {
    it('GET /auth/me is rejected without a bearer token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(403);
      expect(authService.me).not.toHaveBeenCalled();
    });

    it('GET /auth/me passes the authenticated user to the service', async () => {
      authService.me.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer test')
        .expect(200);

      expect(res.body).toEqual({ id: 'user-1', email: 'user@example.com' });
      expect(authService.me).toHaveBeenCalledWith(expect.objectContaining({ sub: 'user-1' }));
    });

    it('POST /auth/change-password validates the body before calling the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', 'Bearer test')
        .send({})
        .expect(400);
      expect(authService.changePassword).not.toHaveBeenCalled();
    });
  });
});
