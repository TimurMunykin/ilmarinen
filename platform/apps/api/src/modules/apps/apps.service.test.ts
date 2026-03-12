// platform/apps/api/src/modules/apps/apps.service.test.ts
import { Test } from '@nestjs/testing';
import { AppsService } from './apps.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AppsService', () => {
  let appsService: AppsService;
  let prisma: {
    app: {
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      app: {
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        AppsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    appsService = module.get(AppsService);
  });

  describe('getUserApps', () => {
    it('should return apps for a user ordered by creation date', async () => {
      const apps = [{ id: 'a1', name: 'App 1' }];
      prisma.app.findMany.mockResolvedValue(apps);

      const result = await appsService.getUserApps('u1');

      expect(result).toEqual(apps);
      expect(prisma.app.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('createApp', () => {
    it('should create an app with CREATING status', async () => {
      const app = { id: 'a1', name: 'My Pet', subdomain: 'my-pet', status: 'CREATING' };
      prisma.app.create.mockResolvedValue(app);

      const result = await appsService.createApp('u1', { name: 'My Pet', subdomain: 'my-pet' });

      expect(result).toEqual(app);
      expect(prisma.app.create).toHaveBeenCalledWith({
        data: { name: 'My Pet', subdomain: 'my-pet', userId: 'u1' },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update app status', async () => {
      prisma.app.update.mockResolvedValue({ id: 'a1', status: 'RUNNING' });

      await appsService.updateStatus('a1', 'RUNNING');

      expect(prisma.app.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { status: 'RUNNING' },
      });
    });

    it('should store error reason when status is ERROR', async () => {
      prisma.app.update.mockResolvedValue({ id: 'a1', status: 'ERROR' });

      await appsService.updateStatus('a1', 'ERROR', 'Build failed');

      expect(prisma.app.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { status: 'ERROR', errorReason: 'Build failed' },
      });
    });
  });
});
