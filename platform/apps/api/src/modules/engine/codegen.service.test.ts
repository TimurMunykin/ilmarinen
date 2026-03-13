import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CodegenService } from './codegen.service';
import { AiAccessService } from '../ai-access/ai-access.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock openai
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  'apps/api/prisma/schema.prisma': 'mock schema',
                  'apps/api/src/app.module.ts': 'mock module',
                }),
              },
            }],
          }),
        },
      },
    })),
  };
});

describe('CodegenService', () => {
  let service: CodegenService;
  let tempDir: string;
  let aiAccessService: { resolveApiKey: jest.Mock };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codegen-test-'));

    // Create minimal template structure in temp dir
    await fs.mkdir(path.join(tempDir, 'apps/api/prisma'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'apps/api/src/modules/notifications'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'apps/web/src/lib/i18n'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'apps/api/prisma/schema.prisma'), 'model User {}');
    await fs.writeFile(path.join(tempDir, 'apps/api/src/app.module.ts'), 'export class AppModule {}');
    await fs.writeFile(path.join(tempDir, 'apps/api/src/modules/notifications/notifications.service.ts'), 'rules');
    await fs.writeFile(path.join(tempDir, 'apps/web/src/lib/i18n/ru.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'apps/web/src/lib/i18n/en.json'), '{}');

    aiAccessService = { resolveApiKey: jest.fn().mockResolvedValue('sk-test-key') };

    const module = await Test.createTestingModule({
      providers: [
        CodegenService,
        { provide: AiAccessService, useValue: aiAccessService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('gpt-4o'),
          },
        },
      ],
    }).compile();

    service = module.get(CodegenService);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should generate files and write them to the app directory', async () => {
    const spec = {
      name: 'My Pet',
      subdomain: 'my-pet',
      description: 'Pet tracker',
      models: [{ name: 'Pet', fields: [{ name: 'name', type: 'String' }] }],
      screens: [{ name: 'PetList', type: 'list' as const, model: 'Pet' }],
    };

    await service.generate('user-1', spec, tempDir);

    // Verify files were written
    const schema = await fs.readFile(
      path.join(tempDir, 'apps/api/prisma/schema.prisma'), 'utf8',
    );
    expect(schema).toBe('mock schema');
  });

  it('should throw if no API key available', async () => {
    aiAccessService.resolveApiKey.mockResolvedValue(null);

    await expect(
      service.generate('user-1', { name: 'x', subdomain: 'x', description: 'x', models: [], screens: [] }, tempDir),
    ).rejects.toThrow('NO_AI_KEY');
  });
});
