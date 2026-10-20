/**
 * Integration tests: WebhooksController over HTTP.
 *
 * Boots the real controller with Nest's HTTP stack, the same global
 * ValidationPipe settings as main.ts, and a mocked WebhooksService, so request
 * parsing, DTO validation, guard wiring and argument passing (including the
 * @CurrentUser decorator) are exercised in full without a database.
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
import { WebhooksController } from '../../src/webhooks/webhooks.controller';
import { WebhooksService } from '../../src/webhooks/webhooks.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { WebhookEventType } from '../../src/webhooks/webhook.dto';

/** Accepts "Authorization: Bearer test" and attaches a fixed user; rejects otherwise. */
@Injectable()
class BearerTestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['authorization'] !== 'Bearer test') return false;
    req.authUser = { id: 'user-1', sub: 'user-1', email: 'user@example.com', role: 'USER' };
    return true;
  }
}

describe('WebhooksController (integration)', () => {
  let app: INestApplication;

  const webhooksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDeliveries: jest.fn(),
    replay: jest.fn(),
    rotateSecret: jest.fn(),
    verifyChallenge: jest.fn(),
  };

  const authHeader = { Authorization: 'Bearer test' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: webhooksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(BearerTestGuard)
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('rejects requests without a valid bearer token', async () => {
      await request(app.getHttpServer()).get('/webhooks').expect(403);
      expect(webhooksService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('POST /webhooks', () => {
    it('creates a webhook for the current user and returns the result', async () => {
      const created = { id: 'wh-1', url: 'https://example.com/hook', eventTypes: [] };
      webhooksService.create.mockResolvedValue(created);

      const response = await request(app.getHttpServer())
        .post('/webhooks')
        .set(authHeader)
        .send({ url: 'https://example.com/hook', eventTypes: [WebhookEventType.PROPERTY_CREATED] })
        .expect(201);

      expect(response.body).toEqual(created);
      expect(webhooksService.create).toHaveBeenCalledWith('user-1', {
        url: 'https://example.com/hook',
        eventTypes: [WebhookEventType.PROPERTY_CREATED],
      });
    });

    it('rejects an invalid url before the service is reached', async () => {
      await request(app.getHttpServer())
        .post('/webhooks')
        .set(authHeader)
        .send({ url: 'not-a-url', eventTypes: [WebhookEventType.PROPERTY_CREATED] })
        .expect(400);

      expect(webhooksService.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown event type', async () => {
      await request(app.getHttpServer())
        .post('/webhooks')
        .set(authHeader)
        .send({ url: 'https://example.com/hook', eventTypes: ['NOT_AN_EVENT'] })
        .expect(400);

      expect(webhooksService.create).not.toHaveBeenCalled();
    });

    it('strips non-whitelisted properties', async () => {
      webhooksService.create.mockResolvedValue({ id: 'wh-1' });

      await request(app.getHttpServer())
        .post('/webhooks')
        .set(authHeader)
        .send({ url: 'https://example.com/hook', eventTypes: [], isActive: true })
        .expect(400);

      expect(webhooksService.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /webhooks', () => {
    it('lists only the current user webhooks', async () => {
      const list = [{ id: 'wh-1' }];
      webhooksService.findAll.mockResolvedValue(list);

      const response = await request(app.getHttpServer())
        .get('/webhooks')
        .set(authHeader)
        .expect(200);

      expect(response.body).toEqual(list);
      expect(webhooksService.findAll).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /webhooks/:id', () => {
    it('passes the id and user through to the service', async () => {
      webhooksService.findOne.mockResolvedValue({ id: 'wh-1' });

      await request(app.getHttpServer()).get('/webhooks/wh-1').set(authHeader).expect(200);

      expect(webhooksService.findOne).toHaveBeenCalledWith('wh-1', 'user-1');
    });
  });

  describe('PATCH /webhooks/:id', () => {
    it('updates a webhook with the validated body', async () => {
      webhooksService.update.mockResolvedValue({ id: 'wh-1', isActive: false });

      await request(app.getHttpServer())
        .patch('/webhooks/wh-1')
        .set(authHeader)
        .send({ isActive: false })
        .expect(200);

      expect(webhooksService.update).toHaveBeenCalledWith('wh-1', 'user-1', { isActive: false });
    });

    it('rejects a non-boolean isActive', async () => {
      await request(app.getHttpServer())
        .patch('/webhooks/wh-1')
        .set(authHeader)
        .send({ isActive: 'yes' })
        .expect(400);

      expect(webhooksService.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /webhooks/:id', () => {
    it('removes a webhook for the current user', async () => {
      webhooksService.remove.mockResolvedValue({ deleted: true });

      await request(app.getHttpServer()).delete('/webhooks/wh-1').set(authHeader).expect(200);

      expect(webhooksService.remove).toHaveBeenCalledWith('wh-1', 'user-1');
    });
  });

  describe('GET /webhooks/:id/deliveries', () => {
    it('returns the delivery log for the webhook', async () => {
      const deliveries = [{ id: 'd-1', status: 'DELIVERED' }];
      webhooksService.getDeliveries.mockResolvedValue(deliveries);

      const response = await request(app.getHttpServer())
        .get('/webhooks/wh-1/deliveries')
        .set(authHeader)
        .expect(200);

      expect(response.body).toEqual(deliveries);
      expect(webhooksService.getDeliveries).toHaveBeenCalledWith('wh-1', 'user-1');
    });
  });

  describe('POST /webhooks/:id/deliveries/:deliveryId/replay', () => {
    it('replays a stored delivery through the service', async () => {
      webhooksService.replay.mockResolvedValue({ id: 'd-1', status: 'RETRYING' });

      await request(app.getHttpServer())
        .post('/webhooks/wh-1/deliveries/d-1/replay')
        .set(authHeader)
        .expect(201);

      expect(webhooksService.replay).toHaveBeenCalledWith('wh-1', 'user-1', 'd-1');
    });
  });

  describe('POST /webhooks/:id/rotate-secret', () => {
    it('rotates the secret and returns it', async () => {
      webhooksService.rotateSecret.mockResolvedValue({ secret: 'new-secret' });

      const response = await request(app.getHttpServer())
        .post('/webhooks/wh-1/rotate-secret')
        .set(authHeader)
        .expect(201);

      expect(response.body).toEqual({ secret: 'new-secret' });
      expect(webhooksService.rotateSecret).toHaveBeenCalledWith('wh-1', 'user-1');
    });
  });

  describe('POST /webhooks/:id/verify', () => {
    it('answers the challenge with the current user', async () => {
      webhooksService.verifyChallenge.mockResolvedValue({ challenge: 'abc' });

      await request(app.getHttpServer())
        .post('/webhooks/wh-1/verify')
        .set(authHeader)
        .send({ challenge: 'abc' })
        .expect(201);

      expect(webhooksService.verifyChallenge).toHaveBeenCalledWith('wh-1', 'user-1', 'abc');
    });

    it('rejects a non-string challenge', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/wh-1/verify')
        .set(authHeader)
        .send({ challenge: 123 })
        .expect(400);

      expect(webhooksService.verifyChallenge).not.toHaveBeenCalled();
    });

    it('rejects a missing challenge', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/wh-1/verify')
        .set(authHeader)
        .send({})
        .expect(400);

      expect(webhooksService.verifyChallenge).not.toHaveBeenCalled();
    });
  });
});
