// platform/apps/api/src/modules/engine/deploy.service.test.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeployService } from './deploy.service';

jest.mock('./exec.utils', () => ({
  execAsync: jest.fn(),
}));

import { execAsync } from './exec.utils';
const mockedExec = execAsync as jest.MockedFunction<typeof execAsync>;

describe('DeployService', () => {
  let service: DeployService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DeployService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: string) => {
              if (key === 'APPS_BASE_DOMAIN') return 'apps.muntim.ru';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(DeployService);
  });

  it('should run build → up → migrate in correct order', async () => {
    mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await service.deploy('/tmp/app', 'my-pet');

    const calls = mockedExec.mock.calls.map(c => c[0]);
    const buildIdx = calls.findIndex(c => c.includes('build'));
    const upIdx = calls.findIndex(c => c.includes('up -d'));
    const migrateIdx = calls.findIndex(c => c.includes('prisma migrate deploy'));

    expect(buildIdx).toBeLessThan(upIdx);
    expect(upIdx).toBeLessThan(migrateIdx);
    // Verify --project-name is used
    expect(calls[buildIdx]).toContain('--project-name my-pet');
    // Create deploy should NOT use --force-recreate
    expect(calls[upIdx]).not.toContain('--force-recreate');
  });

  it('should throw if docker build fails', async () => {
    mockedExec.mockResolvedValue({ stdout: '', stderr: 'build error', exitCode: 1 });

    await expect(service.deploy('/tmp/app', 'my-pet')).rejects.toThrow('Docker build failed');
  });

  it('should use --force-recreate in redeploy but not in deploy', async () => {
    mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await service.redeploy('/tmp/app', 'my-pet');

    const calls = mockedExec.mock.calls.map(c => c[0]);
    const upCall = calls.find(c => c.includes('up -d'));
    expect(upCall).toContain('--force-recreate');
    expect(upCall).toContain('--project-name my-pet');
  });
});
