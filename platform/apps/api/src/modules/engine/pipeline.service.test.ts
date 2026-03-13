// platform/apps/api/src/modules/engine/pipeline.service.test.ts
import { Test } from '@nestjs/testing';
import { PipelineService } from './pipeline.service';
import { ScaffoldService } from './scaffold.service';
import { DatabaseService } from './database.service';
import { CodegenService } from './codegen.service';
import { ValidationService } from './validation.service';
import { DeployService } from './deploy.service';
import { AppsService } from '../apps/apps.service';
import { AppStatus } from '@prisma/client';

describe('PipelineService', () => {
  let pipeline: PipelineService;
  let scaffold: { scaffold: jest.Mock; cleanup: jest.Mock };
  let database: { createDatabase: jest.Mock; dropDatabase: jest.Mock };
  let codegen: { generate: jest.Mock };
  let validation: { validate: jest.Mock };
  let deploy: { deploy: jest.Mock; redeploy: jest.Mock };
  let apps: { updateStatus: jest.Mock; updateSpec: jest.Mock; markDeployed: jest.Mock };

  beforeEach(async () => {
    scaffold = { scaffold: jest.fn().mockResolvedValue('/tmp/my-pet'), cleanup: jest.fn() };
    database = { createDatabase: jest.fn(), dropDatabase: jest.fn() };
    codegen = { generate: jest.fn() };
    validation = { validate: jest.fn().mockResolvedValue({ success: true, errors: [] }) };
    deploy = { deploy: jest.fn(), redeploy: jest.fn() };
    apps = { updateStatus: jest.fn(), updateSpec: jest.fn(), markDeployed: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PipelineService,
        { provide: ScaffoldService, useValue: scaffold },
        { provide: DatabaseService, useValue: database },
        { provide: CodegenService, useValue: codegen },
        { provide: ValidationService, useValue: validation },
        { provide: DeployService, useValue: deploy },
        { provide: AppsService, useValue: apps },
      ],
    }).compile();

    pipeline = module.get(PipelineService);
  });

  it('should update status to CREATING at pipeline start', async () => {
    await pipeline.createApp('app-1', 'user-1', 'My Pet', 'my-pet', { models: [], screens: [] } as any);

    expect(apps.updateStatus).toHaveBeenCalledWith('app-1', AppStatus.CREATING);
  });

  it('should run the full pipeline successfully in correct order', async () => {
    await pipeline.createApp('app-1', 'user-1', 'My Pet', 'my-pet', { models: [], screens: [] } as any);

    expect(apps.updateStatus).toHaveBeenCalledWith('app-1', AppStatus.CREATING);
    expect(scaffold.scaffold).toHaveBeenCalledWith('My Pet', 'my-pet');
    expect(database.createDatabase).toHaveBeenCalledWith('my-pet');
    expect(codegen.generate).toHaveBeenCalled();
    expect(validation.validate).toHaveBeenCalledWith('/tmp/my-pet');
    expect(deploy.deploy).toHaveBeenCalledWith('/tmp/my-pet', 'my-pet');
    expect(apps.markDeployed).toHaveBeenCalledWith('app-1');
  });

  it('should cleanup on failure and set error status', async () => {
    codegen.generate.mockRejectedValue(new Error('AI error'));

    await pipeline.createApp('app-1', 'user-1', 'My Pet', 'my-pet', { models: [], screens: [] } as any);

    expect(apps.updateStatus).toHaveBeenCalledWith('app-1', AppStatus.ERROR, expect.stringContaining('AI error'));
    expect(database.dropDatabase).toHaveBeenCalledWith('my-pet');
    expect(scaffold.cleanup).toHaveBeenCalledWith('my-pet');
  });

  it('should retry code generation on validation failure (up to 3 attempts)', async () => {
    validation.validate
      .mockResolvedValueOnce({ success: false, errors: ['tsc failed: error TS2304'] })
      .mockResolvedValueOnce({ success: true, errors: [] });

    await pipeline.createApp('app-1', 'user-1', 'My Pet', 'my-pet', { models: [], screens: [] } as any);

    // codegen called twice (initial + 1 retry)
    expect(codegen.generate).toHaveBeenCalledTimes(2);
    // Second call should include previous errors
    expect(codegen.generate).toHaveBeenLastCalledWith(
      'user-1', expect.anything(), '/tmp/my-pet', ['tsc failed: error TS2304'],
    );
    expect(apps.markDeployed).toHaveBeenCalledWith('app-1');
  });

  it('should fail after all retries exhausted', async () => {
    validation.validate.mockResolvedValue({ success: false, errors: ['tsc failed'] });

    await pipeline.createApp('app-1', 'user-1', 'My Pet', 'my-pet', { models: [], screens: [] } as any);

    expect(codegen.generate).toHaveBeenCalledTimes(3);
    expect(apps.updateStatus).toHaveBeenCalledWith('app-1', AppStatus.ERROR, expect.stringContaining('Validation failed after 3 attempts'));
    expect(database.dropDatabase).toHaveBeenCalled();
  });

  describe('prepareEdit', () => {
    beforeEach(() => {
      process.env.APPS_DIR = '/tmp';
    });

    it('should return null and start deploy when no destructive changes', async () => {
      jest.spyOn(pipeline as any, 'checkMigration').mockResolvedValue({
        hasDestructiveChanges: false,
        sql: 'ALTER TABLE "pet" ADD COLUMN "age" INTEGER;',
      });

      const result = await pipeline.prepareEdit('app-1', 'user-1', 'my-pet', { models: [], screens: [] } as any);

      expect(result).toBeNull();
      expect(codegen.generate).toHaveBeenCalled();
    });

    it('should return migration check when destructive changes detected', async () => {
      jest.spyOn(pipeline as any, 'checkMigration').mockResolvedValue({
        hasDestructiveChanges: true,
        sql: 'DROP TABLE "pet";',
      });

      const result = await pipeline.prepareEdit('app-1', 'user-1', 'my-pet', { models: [], screens: [] } as any);

      expect(result).not.toBeNull();
      expect(result!.hasDestructiveChanges).toBe(true);
      expect(result!.sql).toContain('DROP TABLE');
    });

    it('should set ERROR status on failure', async () => {
      codegen.generate.mockRejectedValue(new Error('AI error'));

      await expect(
        pipeline.prepareEdit('app-1', 'user-1', 'my-pet', { models: [], screens: [] } as any),
      ).rejects.toThrow('AI error');

      expect(apps.updateStatus).toHaveBeenCalledWith('app-1', AppStatus.ERROR, 'AI error');
    });
  });
});
