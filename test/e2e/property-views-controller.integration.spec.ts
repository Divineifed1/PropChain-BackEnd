/**
 * Integration tests: PropertyViewsController over HTTP.
 *
 * Boots the real controller with Nest's HTTP stack, the same global
 * ValidationPipe settings as main.ts, and a mocked PropertyViewsService, so
 * request parsing, UUID validation, the optional-auth guard and the
 * forwarding of IP / user-agent / user id are all exercised without a DB.
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
import { PropertyViewsController } from '../../src/property-views/property-views.controller';
import { PropertyViewsService } from '../../src/property-views/property-views.service';
import { OptionalJwtAuthGuard } from '../../src/property-views/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';

/** Attaches a fixed user when "Authorization: Bearer test" is present; never blocks. */
@Injectable()
class OptionalBearerTestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['authorization'] === 'Bearer test') {
      req.authUser = { sub: 'user-1', email: 'user@example.com', role: 'USER' };
    }
    return true;
  }
}

describe('PropertyViewsController (integration)', () => {
  let app: INestApplication;

  const propertyViewsService = {
    recordView: jest.fn(),
    getViewCount: jest.fn(),
    getUniqueVisitorCount: jest.fn(),
    getViewHistory: jest.fn(),
    getPopularProperties: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyViewsController],
      providers: [{ provide: PropertyViewsService, useValue: propertyViewsService }],
    })
      .overrideGuard(OptionalJwtAuthGuard)
      .useClass(OptionalBearerTestGuard)
      .overrideGuard(JwtAuthGuard)
      .useClass(OptionalBearerTestGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /property-views/:propertyId', () => {
    it('records an anonymous view using the forwarded IP', async () => {
      propertyViewsService.recordView.mockResolvedValue({ id: 'view-1' });

      await request(app.getHttpServer())
        .post(`/property-views/${PROPERTY_ID}`)
        .set('X-Forwarded-For', '203.0.113.7, 10.0.0.1')
        .set('User-Agent', 'jest-agent')
        .send({ referrer: 'https://example.com', sessionId: 'sess-1' })
        .expect(201);

      expect(propertyViewsService.recordView).toHaveBeenCalledWith(PROPERTY_ID, {
        userId: null,
        ipAddress: '203.0.113.7',
        userAgent: 'jest-agent',
        referrer: 'https://example.com',
        sessionId: 'sess-1',
      });
    });

    it('attributes the view to the authenticated user when a token is present', async () => {
      propertyViewsService.recordView.mockResolvedValue({ id: 'view-2' });

      await request(app.getHttpServer())
        .post(`/property-views/${PROPERTY_ID}`)
        .set('Authorization', 'Bearer test')
        .send({})
        .expect(201);

      expect(propertyViewsService.recordView).toHaveBeenCalledWith(
        PROPERTY_ID,
        expect.objectContaining({ userId: 'user-1', referrer: null, sessionId: null }),
      );
    });

    it('rejects a non-UUID property id before reaching the service', async () => {
      await request(app.getHttpServer()).post('/property-views/not-a-uuid').send({}).expect(400);

      expect(propertyViewsService.recordView).not.toHaveBeenCalled();
    });

    it('rejects non-whitelisted body properties', async () => {
      await request(app.getHttpServer())
        .post(`/property-views/${PROPERTY_ID}`)
        .send({ referrer: 'x', userId: 'spoofed' })
        .expect(400);

      expect(propertyViewsService.recordView).not.toHaveBeenCalled();
    });
  });

  describe('GET /property-views/:propertyId/count', () => {
    it('returns the lifetime count', async () => {
      propertyViewsService.getViewCount.mockResolvedValue(42);

      const response = await request(app.getHttpServer())
        .get(`/property-views/${PROPERTY_ID}/count`)
        .expect(200);

      expect(response.body).toEqual({ propertyId: PROPERTY_ID, count: 42 });
    });
  });

  describe('GET /property-views/:propertyId/unique', () => {
    it('returns the unique visitor breakdown, parsing `since`', async () => {
      propertyViewsService.getUniqueVisitorCount.mockResolvedValue({
        total: 5,
        authenticatedUsers: 3,
        anonymousIps: 2,
      });

      const response = await request(app.getHttpServer())
        .get(`/property-views/${PROPERTY_ID}/unique`)
        .query({ since: '2026-01-01T00:00:00.000Z' })
        .expect(200);

      expect(response.body).toEqual({
        propertyId: PROPERTY_ID,
        total: 5,
        authenticatedUsers: 3,
        anonymousIps: 2,
      });
      const [, sinceArg] = propertyViewsService.getUniqueVisitorCount.mock.calls[0];
      expect(sinceArg).toBeInstanceOf(Date);
    });

    it('rejects an invalid `since` timestamp', async () => {
      await request(app.getHttpServer())
        .get(`/property-views/${PROPERTY_ID}/unique`)
        .query({ since: 'not-a-date' })
        .expect(400);

      expect(propertyViewsService.getUniqueVisitorCount).not.toHaveBeenCalled();
    });
  });

  describe('GET /property-views/:propertyId/history', () => {
    it('forwards pagination to the service', async () => {
      propertyViewsService.getViewHistory.mockResolvedValue({ items: [], total: 0 });

      await request(app.getHttpServer())
        .get(`/property-views/${PROPERTY_ID}/history`)
        .set('Authorization', 'Bearer test')
        .query({ skip: 10, take: 5 })
        .expect(200);

      expect(propertyViewsService.getViewHistory).toHaveBeenCalledWith(PROPERTY_ID, {
        skip: 10,
        take: 5,
        since: undefined,
      });
    });
  });

  describe('GET /property-views/popular', () => {
    it('returns the most-viewed properties', async () => {
      propertyViewsService.getPopularProperties.mockResolvedValue([{ propertyId: PROPERTY_ID }]);

      const response = await request(app.getHttpServer())
        .get('/property-views/popular')
        .query({ take: 3 })
        .expect(200);

      expect(response.body).toEqual([{ propertyId: PROPERTY_ID }]);
      expect(propertyViewsService.getPopularProperties).toHaveBeenCalledWith({
        take: 3,
        since: undefined,
      });
    });
  });

  describe('GET /property-views/leaderboard', () => {
    it('shares the popular-properties implementation', async () => {
      propertyViewsService.getPopularProperties.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/property-views/leaderboard')
        .query({ take: 2 })
        .expect(200);

      expect(propertyViewsService.getPopularProperties).toHaveBeenCalledWith({
        take: 2,
        since: undefined,
      });
    });
  });
});
