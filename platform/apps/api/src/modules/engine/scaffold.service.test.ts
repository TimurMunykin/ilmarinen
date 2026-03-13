import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ScaffoldService } from './scaffold.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ScaffoldService', () => {
  let service: ScaffoldService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-test-'));

    const module = await Test.createTestingModule({
      providers: [
        ScaffoldService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const values: Record<string, string> = {
                TEMPLATE_PATH: path.join(__dirname, '../../../../../../template'),
                APPS_DIR: tempDir,
                RSA_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\ntest-key\n-----END PUBLIC KEY-----',
                TELEGRAM_BOT_TOKEN: 'test-bot-token',
                DATABASE_HOST: 'postgres',
              };
              return values[key];
            }),
            get: jest.fn((key: string, defaultVal?: string) => {
              const values: Record<string, string> = {
                ILMARINEN_URL: 'https://ilmarinen.muntim.ru',
              };
              return values[key] ?? defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(ScaffoldService);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should scaffold app directory with replaced placeholders', async () => {
    const appDir = await service.scaffold('My Pet Tracker', 'my-pet');

    // Check directory exists
    const stat = await fs.stat(appDir);
    expect(stat.isDirectory()).toBe(true);

    // Check placeholder replacement in package.json (template uses {{APP_SUBDOMAIN}} for npm name)
    const rootPkg = JSON.parse(
      await fs.readFile(path.join(appDir, 'package.json'), 'utf8'),
    );
    expect(rootPkg.name).toBe('my-pet');
    // Verify no remaining placeholders
    const pkgStr = JSON.stringify(rootPkg);
    expect(pkgStr).not.toContain('{{');

    // Check .env was generated
    const envContent = await fs.readFile(path.join(appDir, '.env'), 'utf8');
    expect(envContent).toContain('APP_NAME=My Pet Tracker');
    expect(envContent).toContain('APP_SUBDOMAIN=my-pet');
    expect(envContent).toContain('DATABASE_URL=postgresql://my_pet:my_pet@postgres:5432/my_pet');
    expect(envContent).toContain('ILMARINEN_PUBLIC_KEY=');
    expect(envContent).toContain('TELEGRAM_BOT_TOKEN=test-bot-token');
  });

  it('should throw if app directory already exists', async () => {
    await fs.mkdir(path.join(tempDir, 'my-pet'), { recursive: true });
    await expect(service.scaffold('My Pet', 'my-pet')).rejects.toThrow();
  });
});
