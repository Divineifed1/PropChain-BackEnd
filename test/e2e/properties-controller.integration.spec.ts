/**
 * Integration tests: PropertiesController over HTTP.
 *
 * Real controller, Nest HTTP stack and the same global ValidationPipe settings as
 * main.ts, with mocked services and role-aware guards. Covers public reads, the
 * 404 contract, query/body validation, role enforcement and argument passing.
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
import { PropertiesController } from '../../src/properties/properties.controller';
import { PropertiesService } from '../../src/properties/properties.service';
import { PropertyReportService } from '../../src/properties/report/property-report.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';

/** "Authorization: Bearer role:ADMIN|AGENT|USER"; anything else is rejected. */
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

/** Stands in for RolesGuard + @Roles on the routes this suite exercises. */
@Injectable()
class RoleListGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const role: string | undefined = req.authUser?.role;
    // PUT: AGENT or ADMIN. DELETE and everything else admin-gated here: ADMIN.
    if (method === 'PUT') return role === 'AGENT' || role === 'ADMIN';
    return role === 'ADMIN';
  }
}

describe('PropertiesController (integration)', () => {
  let app: INestApplication;
  const propertiesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    searchProperties: jest.fn(),
  };

  const as = (role: string, r: request.Test) => r.set('Authorization', `Bearer role:${role}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [
        { provide: PropertiesService, useValue: propertiesService },
        { provide: PropertyReportService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RoleTestGuard)
      .overrideGuard(RolesGuard)
      .useClass(RoleListGuard)
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

  describe('public reads', () => {
    it('GET /properties lists without authentication', async () => {
      propertiesService.findAll.mockResolvedValue([{ id: 'p1' }]);
      const res = await request(app.getHttpServer()).get('/properties').expect(200);
      expect(res.body).toEqual([{ id: 'p1' }]);
    });

    it('GET /properties/:id returns the property', async () => {
      propertiesService.findOne.mockResolvedValue({ id: 'p1', title: 'Loft' });
      const res = await request(app.getHttpServer()).get('/properties/p1').expect(200);
      expect(res.body).toMatchObject({ id: 'p1', title: 'Loft' });
      expect(propertiesService.findOne).toHaveBeenCalledWith('p1');
    });

    it('GET /properties/:id answers 404 for an unknown property', async () => {
      propertiesService.findOne.mockResolvedValue(null);
      await request(app.getHttpServer()).get('/properties/missing').expect(404);
    });
  });

  describe('GET /properties/search', () => {
    it('is matched before :id and coerces numeric filters', async () => {
      propertiesService.searchProperties.mockResolvedValue({ items: [], total: 0 });

      await request(app.getHttpServer())
        .get('/properties/search?city=Austin&minPrice=1000&bedrooms=2')
        .expect(200);

      expect(propertiesService.searchProperties).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Austin', minPrice: 1000, bedrooms: 2 }),
      );
      expect(propertiesService.findOne).not.toHaveBeenCalled();
    });

    it('rejects a negative price with 400', async () => {
      await request(app.getHttpServer()).get('/properties/search?minPrice=-5').expect(400);
      expect(propertiesService.searchProperties).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric bedrooms filter with 400', async () => {
      await request(app.getHttpServer()).get('/properties/search?bedrooms=many').expect(400);
    });
  });

  describe('POST /properties', () => {
    const valid = {
      title: 'Loft',
      address: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '73301',
      price: 250000,
      propertyType: 'APARTMENT',
    };

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/properties').send(valid).expect(403);
    });

    it('creates a property owned by the caller', async () => {
      propertiesService.create.mockResolvedValue({ id: 'p1' });

      await as('USER', request(app.getHttpServer()).post('/properties').send(valid)).expect(201);

      expect(propertiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Loft', price: 250000 }),
        'user-1',
      );
    });

    it('rejects a missing required field with 400', async () => {
      const { city: _omit, ...withoutCity } = valid;
      await as('USER', request(app.getHttpServer()).post('/properties').send(withoutCity)).expect(400);
      expect(propertiesService.create).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric price with 400', async () => {
      await as(
        'USER',
        request(app.getHttpServer()).post('/properties').send({ ...valid, price: 'cheap' }),
      ).expect(400);
    });

    it('rejects unknown fields with 400 (forbidNonWhitelisted)', async () => {
      await as(
        'USER',
        request(app.getHttpServer()).post('/properties').send({ ...valid, ownerId: 'someone-else' }),
      ).expect(400);
      expect(propertiesService.create).not.toHaveBeenCalled();
    });
  });

  describe('role-restricted writes', () => {
    it('PUT /properties/:id is rejected for a plain USER', async () => {
      await as('USER', request(app.getHttpServer()).put('/properties/p1').send({ title: 'New' })).expect(403);
      expect(propertiesService.update).not.toHaveBeenCalled();
    });

    it('PUT /properties/:id is allowed for an AGENT and passes the caller id', async () => {
      propertiesService.update.mockResolvedValue({ id: 'p1' });

      await as('AGENT', request(app.getHttpServer()).put('/properties/p1').send({ title: 'New' })).expect(200);

      expect(propertiesService.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ title: 'New' }),
        'agent-1',
      );
    });

    it('DELETE /properties/:id is admin-only', async () => {
      await as('AGENT', request(app.getHttpServer()).delete('/properties/p1')).expect(403);
      expect(propertiesService.remove).not.toHaveBeenCalled();

      propertiesService.remove.mockResolvedValue({ id: 'p1', deleted: true });
      await as('ADMIN', request(app.getHttpServer()).delete('/properties/p1')).expect(200);
      expect(propertiesService.remove).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ sub: 'admin-1', role: 'ADMIN' }),
      );
    });
  });
});
