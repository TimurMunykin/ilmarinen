# App Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the App Engine — a pipeline that takes an app spec (JSON), scaffolds a project from the template, generates code via OpenAI, validates, builds Docker images, deploys containers, and runs a health check.

**Architecture:** App Engine is a new NestJS module inside `platform/apps/api`. It orchestrates a linear pipeline: scaffold → generate → validate → build → deploy → health-check. Each step is a focused service. The pipeline runs async — the API returns immediately after starting, and the frontend polls app status. Generated apps live in `~/apps/<subdomain>/` on the host, each with its own Docker Compose stack and PostgreSQL database (in the shared server).

**Tech Stack:** NestJS 11, OpenAI API (via `openai` npm package), Prisma, Docker CLI (exec from Node), PostgreSQL `createdb`/`dropdb` via `psql`

---

## Chunk 1: Scaffolding and Database

### Task 1: Scaffold service — clone template and replace placeholders

**Files:**
- Create: `platform/apps/api/src/modules/engine/scaffold.service.ts`
- Create: `platform/apps/api/src/modules/engine/scaffold.service.test.ts`

The scaffold service copies the template directory to `~/apps/<subdomain>/`, replaces `{{APP_NAME}}` and `{{APP_SUBDOMAIN}}` placeholders in all relevant files, and generates the `.env` file with correct database URL, RSA public key, Telegram bot token, etc.

- [ ] **Step 1: Write the failing test**

```typescript
// platform/apps/api/src/modules/engine/scaffold.service.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd platform/apps/api && bunx jest src/modules/engine/scaffold.service.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement scaffold.service.ts**

```typescript
// platform/apps/api/src/modules/engine/scaffold.service.ts
import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Text file extensions to scan for placeholder replacement. */
const TEXT_EXTENSIONS = new Set([
  '.json', '.ts', '.tsx', '.js', '.jsx', '.html', '.css',
  '.yml', '.yaml', '.md', '.prisma', '.env', '.sh', '',
]);

@Injectable()
export class ScaffoldService {
  private readonly logger = new Logger(ScaffoldService.name);
  private readonly templatePath: string;
  private readonly appsDir: string;

  constructor(private config: ConfigService) {
    this.templatePath = config.getOrThrow('TEMPLATE_PATH');
    this.appsDir = config.getOrThrow('APPS_DIR');
  }

  async scaffold(appName: string, subdomain: string): Promise<string> {
    const appDir = path.join(this.appsDir, subdomain);

    // Guard: don't overwrite existing app
    try {
      await fs.access(appDir);
      throw new ConflictException(`App directory already exists: ${appDir}`);
    } catch (e: any) {
      if (e instanceof ConflictException) throw e;
      // ENOENT is expected — directory doesn't exist yet
    }

    this.logger.log(`Scaffolding ${subdomain} from template...`);

    // 1. Copy template
    await fs.cp(this.templatePath, appDir, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.includes('.git') && !src.includes('bun.lock'),
    });

    // 2. Replace placeholders in all text files (recursive walk)
    await this.replacePlaceholders(appDir, appName, subdomain);

    // 3. Generate .env
    await this.generateEnvFile(appDir, appName, subdomain);

    this.logger.log(`Scaffolded ${subdomain} at ${appDir}`);
    return appDir;
  }

  async cleanup(subdomain: string): Promise<void> {
    const appDir = path.join(this.appsDir, subdomain);
    try {
      await fs.rm(appDir, { recursive: true, force: true });
      this.logger.log(`Cleaned up ${appDir}`);
    } catch {
      this.logger.warn(`Failed to clean up ${appDir}`);
    }
  }

  private async replacePlaceholders(dir: string, appName: string, subdomain: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.replacePlaceholders(fullPath, appName, subdomain);
      } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        let content = await fs.readFile(fullPath, 'utf8');
        if (content.includes('{{APP_NAME}}') || content.includes('{{APP_SUBDOMAIN}}')) {
          content = content.replaceAll('{{APP_NAME}}', appName);
          content = content.replaceAll('{{APP_SUBDOMAIN}}', subdomain);
          await fs.writeFile(fullPath, content);
        }
      }
    }
  }

  private async generateEnvFile(appDir: string, appName: string, subdomain: string) {
    const rsaPublicKey = this.config.getOrThrow('RSA_PUBLIC_KEY');
    const telegramBotToken = this.config.getOrThrow('TELEGRAM_BOT_TOKEN');
    const dbHost = this.config.getOrThrow('DATABASE_HOST');
    const ilmarinenUrl = this.config.get('ILMARINEN_URL', 'https://ilmarinen.muntim.ru');

    const dbId = subdomain.replace(/-/g, '_');
    const env = [
      `APP_NAME=${appName}`,
      `APP_SUBDOMAIN=${subdomain}`,
      `DATABASE_URL=postgresql://${dbId}:${dbId}@${dbHost}:5432/${dbId}`,
      `ILMARINEN_URL=${ilmarinenUrl}`,
      `ILMARINEN_PUBLIC_KEY="${rsaPublicKey}"`,
      `TELEGRAM_BOT_TOKEN=${telegramBotToken}`,
      `API_PORT=3001`,
    ].join('\n') + '\n';

    await fs.writeFile(path.join(appDir, '.env'), env);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd platform/apps/api && bunx jest src/modules/engine/scaffold.service.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add platform/apps/api/src/modules/engine/scaffold.service.ts platform/apps/api/src/modules/engine/scaffold.service.test.ts
git commit -m "feat(engine): add scaffold service — clone template and replace placeholders"
```

---

### Task 2: Database service — create and drop per-app databases

**Files:**
- Create: `platform/apps/api/src/modules/engine/database.service.ts`
- Create: `platform/apps/api/src/modules/engine/database.service.test.ts`

Each generated app gets its own PostgreSQL database in the shared server. The database service runs `CREATE DATABASE` and `CREATE USER` via the platform's Prisma connection, and `DROP DATABASE` / `DROP USER` for cleanup.

- [ ] **Step 1: Write the failing test**

```typescript
// platform/apps/api/src/modules/engine/database.service.test.ts
import { Test } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let prisma: { $executeRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $executeRawUnsafe: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DatabaseService);
  });

  describe('createDatabase', () => {
    it('should create user and database for subdomain', async () => {
      await service.createDatabase('my-pet');

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      // First call: CREATE USER
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('CREATE USER');
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('my_pet');
      // Second call: CREATE DATABASE
      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('CREATE DATABASE');
      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('my_pet');
    });

    it('should sanitize subdomain for SQL identifiers', async () => {
      await service.createDatabase('my-pet');
      // Hyphens replaced with underscores in SQL identifiers
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('my_pet');
    });
  });

  describe('dropDatabase', () => {
    it('should drop database and user', async () => {
      await service.dropDatabase('my-pet');

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('DROP DATABASE');
      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('DROP USER');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd platform/apps/api && bunx jest src/modules/engine/database.service.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement database.service.ts**

```typescript
// platform/apps/api/src/modules/engine/database.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a PostgreSQL user and database for a generated app.
   * Uses the subdomain as both username and db name (hyphens → underscores).
   */
  async createDatabase(subdomain: string): Promise<void> {
    const id = this.sanitize(subdomain);
    this.logger.log(`Creating database and user: ${id}`);

    await this.prisma.$executeRawUnsafe(
      `CREATE USER "${id}" WITH PASSWORD '${id}'`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE DATABASE "${id}" OWNER "${id}"`,
    );
  }

  /**
   * Drop a generated app's database and user. Used for cleanup on failure.
   */
  async dropDatabase(subdomain: string): Promise<void> {
    const id = this.sanitize(subdomain);
    this.logger.log(`Dropping database and user: ${id}`);

    try {
      await this.prisma.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${id}" WITH (FORCE)`,
      );
      await this.prisma.$executeRawUnsafe(`DROP USER IF EXISTS "${id}"`);
    } catch (error) {
      this.logger.warn(`Failed to drop database ${id}`, error);
    }
  }

  /** Replace hyphens with underscores and validate as safe SQL identifier. */
  private sanitize(subdomain: string): string {
    const id = subdomain.replace(/-/g, '_');
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(id)) {
      throw new Error(`Invalid database identifier: ${id}`);
    }
    return id;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd platform/apps/api && bunx jest src/modules/engine/database.service.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add platform/apps/api/src/modules/engine/database.service.ts platform/apps/api/src/modules/engine/database.service.test.ts
git commit -m "feat(engine): add database service — create/drop per-app databases"
```

---

## Chunk 2: Code Generation

### Task 3: Code generation service — call OpenAI to generate code from spec

**Prerequisite:** Before writing any code, install the `openai` package:

```bash
cd platform/apps/api && bun add openai
```

**Files:**
- Create: `platform/apps/api/src/modules/engine/codegen.service.ts`
- Create: `platform/apps/api/src/modules/engine/codegen.service.test.ts`
- Create: `platform/apps/api/src/modules/engine/prompts.ts`

The codegen service takes an app spec (JSON) and the scaffolded app directory, calls OpenAI to generate all business-logic files, and writes them to the correct locations. It uses template injection markers for Prisma schema, app.module.ts, and notification rules, and creates new files for modules, routes, and components.

- [ ] **Step 1: Create the prompt template**

```typescript
// platform/apps/api/src/modules/engine/prompts.ts

export function buildCodegenPrompt(spec: AppSpec, templateFiles: TemplateContext): string {
  return `You are a code generator for a NestJS + React web application.

Given the following app specification, generate all the code files needed.

## App Specification
\`\`\`json
${JSON.stringify(spec, null, 2)}
\`\`\`

## Template Context

The app is based on a template with these existing files. You must NOT modify these files except through the injection markers noted below.

### Prisma Schema (existing base)
\`\`\`prisma
${templateFiles.prismaSchema}
\`\`\`
Add your models AFTER the marker \`// === GENERATED MODELS BELOW === //\`.
Every model must have a \`userId String\` field with a relation to User (the user who owns the record).
Use Prisma conventions: \`@id @default(uuid())\`, \`@default(now())\`, \`@updatedAt\`.
For relations between generated models, use many-to-one with \`@relation(fields: [...], references: [id], onDelete: Cascade)\`.

### App Module (existing base)
\`\`\`typescript
${templateFiles.appModule}
\`\`\`
Add import statements at the \`// === GENERATED MODULE IMPORTS === //\` marker.
Add module names to the imports array at the \`// === GENERATED MODULES === //\` marker.

### Notification Service (existing base)
\`\`\`typescript
${templateFiles.notificationService}
\`\`\`
Replace the NOTIFICATION_RULES array between the markers with actual rules from the spec.

## Output Format

Respond with a JSON object. Each key is a file path relative to the app root. Each value is the complete file content as a string.

Required files:
1. \`apps/api/prisma/schema.prisma\` — full file with base + generated models
2. \`apps/api/src/app.module.ts\` — full file with base + generated module imports
3. \`apps/api/src/modules/notifications/notifications.service.ts\` — full file with generated rules
4. For each model in the spec:
   - \`apps/api/src/modules/<model-lowercase>/<model-lowercase>.module.ts\`
   - \`apps/api/src/modules/<model-lowercase>/<model-lowercase>.controller.ts\`
   - \`apps/api/src/modules/<model-lowercase>/<model-lowercase>.service.ts\`
   - \`apps/api/src/modules/<model-lowercase>/create-<model-lowercase>.dto.ts\`
   - \`apps/api/src/modules/<model-lowercase>/update-<model-lowercase>.dto.ts\`
5. For each screen in the spec:
   - \`apps/web/src/routes/app/<screen-name-kebab>.tsx\`
6. \`apps/web/src/lib/i18n/ru.json\` — full file merging base translations with new keys
7. \`apps/web/src/lib/i18n/en.json\` — full file merging base translations with new keys

## Rules
- Use NestJS decorators: @Controller, @Get, @Post, @Patch, @Delete, @UseGuards(JwtAuthGuard), @CurrentUser
- All endpoints must be auth-guarded and scoped to the current user (filter by userId)
- Import guards from \`../auth/guards/jwt-auth.guard\`
- Import CurrentUser from \`../auth/decorators/current-user.decorator\`
- DTOs use class-validator decorators (@IsString, @IsOptional, etc.) with \`!\` assertion
- React routes use \`createFileRoute\` from @tanstack/react-router
- React pages use shadcn/ui components (Button, Card, Input, etc.) already available in the project
- The \`@CurrentUser()\` decorator returns \`{ id: string; email: string; name: string | null }\`
- Use \`useTranslation\` hook for all user-facing strings
- API calls go through \`/api/<model-plural>\` endpoints using the existing \`apiFetch\` from \`@/lib/api\`
- Convert PascalCase screen names to kebab-case for file names (e.g., \`PetList\` → \`pet-list.tsx\`)

Respond ONLY with valid JSON. No markdown fences, no explanation.`;
}

export interface AppSpec {
  name: string;
  subdomain: string;
  description: string;
  models: {
    name: string;
    fields: { name: string; type: string; optional?: boolean; target?: string }[];
  }[];
  screens: {
    name: string;
    type: 'list' | 'detail' | 'form';
    model: string;
    children?: string[];
  }[];
  notifications?: {
    trigger: { model: string; condition: string };
    channel: 'telegram';
    template: string;
  }[];
}

export interface TemplateContext {
  prismaSchema: string;
  appModule: string;
  notificationService: string;
  i18nRu: string;
  i18nEn: string;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// platform/apps/api/src/modules/engine/codegen.service.test.ts
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
```

- [ ] **Step 3: Implement codegen.service.ts**

```typescript
// platform/apps/api/src/modules/engine/codegen.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AiAccessService } from '../ai-access/ai-access.service';
import { buildCodegenPrompt, type AppSpec, type TemplateContext } from './prompts';

@Injectable()
export class CodegenService {
  private readonly logger = new Logger(CodegenService.name);

  constructor(
    private aiAccessService: AiAccessService,
    private config: ConfigService,
  ) {}

  async generate(userId: string, spec: AppSpec, appDir: string, previousErrors?: string[]): Promise<void> {
    const apiKey = await this.aiAccessService.resolveApiKey(userId);
    if (!apiKey) throw new BadRequestException('NO_AI_KEY');

    const client = new OpenAI({ apiKey });
    const model = this.config.get('OPENAI_MODEL', 'gpt-4o');

    const templateContext = await this.readTemplateContext(appDir);
    let prompt = buildCodegenPrompt(spec, templateContext);
    if (previousErrors?.length) {
      prompt += `\n\n## Previous Attempt Errors\nThe previous code generation had these validation errors. Fix them:\n${previousErrors.join('\n')}`;
    }

    this.logger.log(`Generating code for ${spec.subdomain} with ${model}...`);

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const files: Record<string, string> = JSON.parse(content);

    // Write all generated files (with path traversal guard)
    const resolvedAppDir = path.resolve(appDir);
    for (const [filePath, fileContent] of Object.entries(files)) {
      const fullPath = path.resolve(appDir, filePath);
      if (!fullPath.startsWith(resolvedAppDir + path.sep)) {
        throw new Error(`Path traversal attempt blocked: ${filePath}`);
      }
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, fileContent);
      this.logger.debug(`Wrote ${filePath}`);
    }

    this.logger.log(`Generated ${Object.keys(files).length} files for ${spec.subdomain}`);
  }

  private async readTemplateContext(appDir: string): Promise<TemplateContext> {
    const read = (rel: string) => fs.readFile(path.join(appDir, rel), 'utf8');
    return {
      prismaSchema: await read('apps/api/prisma/schema.prisma'),
      appModule: await read('apps/api/src/app.module.ts'),
      notificationService: await read('apps/api/src/modules/notifications/notifications.service.ts'),
      i18nRu: await read('apps/web/src/lib/i18n/ru.json'),
      i18nEn: await read('apps/web/src/lib/i18n/en.json'),
    };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd platform/apps/api && bunx jest src/modules/engine/codegen.service.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add platform/apps/api/src/modules/engine/codegen.service.ts platform/apps/api/src/modules/engine/codegen.service.test.ts platform/apps/api/src/modules/engine/prompts.ts
git commit -m "feat(engine): add code generation service with OpenAI integration"
```

---

## Chunk 3: Validation, Build, and Deploy

### Task 4: Validation service — Prisma validate + TypeScript check

**Files:**
- Create: `platform/apps/api/src/modules/engine/validation.service.ts`
- Create: `platform/apps/api/src/modules/engine/validation.service.test.ts`
- Create: `platform/apps/api/src/modules/engine/exec.utils.ts`

- [ ] **Step 1: Create exec utility**

A shared helper for running shell commands with timeout and output capture.

```typescript
// platform/apps/api/src/modules/engine/exec.utils.ts
import { exec } from 'child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function execAsync(
  command: string,
  options: { cwd?: string; timeout?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 60_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error
            ? (typeof error.code === 'number' ? error.code : (error.killed ? 124 : 1))
            : 0,
        });
      },
    );
  });
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// platform/apps/api/src/modules/engine/validation.service.test.ts
import { Test } from '@nestjs/testing';
import { ValidationService, ValidationResult } from './validation.service';

// We test by mocking execAsync
jest.mock('./exec.utils', () => ({
  execAsync: jest.fn(),
}));

import { execAsync } from './exec.utils';
const mockedExec = execAsync as jest.MockedFunction<typeof execAsync>;

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ValidationService],
    }).compile();

    service = module.get(ValidationService);
  });

  it('should return success when both validations pass', async () => {
    mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should return errors when prisma validate fails', async () => {
    mockedExec
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // bun install
      .mockResolvedValueOnce({ stdout: '', stderr: 'Error: missing field', exitCode: 1 }); // prisma validate (returns early)

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('prisma');
  });

  it('should return errors when tsc fails', async () => {
    mockedExec
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // bun install
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // prisma validate
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // prisma generate
      .mockResolvedValueOnce({ stdout: 'error TS2304: Cannot find name', stderr: '', exitCode: 2 }); // tsc

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('tsc');
  });

  it('should fail early if bun install fails', async () => {
    mockedExec.mockResolvedValueOnce({ stdout: '', stderr: 'resolve error', exitCode: 1 });

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('bun install');
  });
});
```

- [ ] **Step 3: Implement validation.service.ts**

```typescript
// platform/apps/api/src/modules/engine/validation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { execAsync } from './exec.utils';

export interface ValidationResult {
  success: boolean;
  errors: string[];
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  async validate(appDir: string): Promise<ValidationResult> {
    const apiDir = `${appDir}/apps/api`;
    const errors: string[] = [];

    this.logger.log(`Validating ${appDir}...`);

    // 1. Install dependencies (monorepo root — bun workspace resolves all packages)
    const install = await execAsync('bun install', { cwd: appDir, timeout: 120_000 });
    if (install.exitCode !== 0) {
      return { success: false, errors: [`bun install failed: ${install.stderr}`] };
    }

    // 2. Prisma validate
    const prismaValidate = await execAsync(
      'DATABASE_URL="postgresql://x:x@localhost:5432/x" bunx prisma validate',
      { cwd: apiDir },
    );
    if (prismaValidate.exitCode !== 0) {
      errors.push(`prisma validate failed:\n${prismaValidate.stderr}`);
      return { success: false, errors };
    }

    // 3. Prisma generate (needed for tsc to resolve @prisma/client types)
    const prismaGenerate = await execAsync(
      'DATABASE_URL="postgresql://x:x@localhost:5432/x" bunx prisma generate',
      { cwd: apiDir },
    );
    if (prismaGenerate.exitCode !== 0) {
      errors.push(`prisma generate failed:\n${prismaGenerate.stderr}`);
      return { success: false, errors };
    }

    // 4. TypeScript check
    const tsc = await execAsync('bunx tsc --noEmit', { cwd: apiDir });
    if (tsc.exitCode !== 0) {
      errors.push(`tsc failed:\n${tsc.stdout}\n${tsc.stderr}`);
      return { success: false, errors };
    }

    this.logger.log(`Validation passed for ${appDir}`);
    return { success: true, errors: [] };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd platform/apps/api && bunx jest src/modules/engine/validation.service.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add platform/apps/api/src/modules/engine/validation.service.ts platform/apps/api/src/modules/engine/validation.service.test.ts platform/apps/api/src/modules/engine/exec.utils.ts
git commit -m "feat(engine): add validation service — prisma validate + tsc check"
```

---

### Task 5: Build and deploy service — Docker build, compose up, health check

**Files:**
- Create: `platform/apps/api/src/modules/engine/deploy.service.ts`
- Create: `platform/apps/api/src/modules/engine/deploy.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Implement deploy.service.ts**

```typescript
// platform/apps/api/src/modules/engine/deploy.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execAsync } from './exec.utils';

const HEALTH_CHECK_TIMEOUT = 30_000;
const HEALTH_CHECK_INTERVAL = 2_000;

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);
  private readonly baseDomain: string;

  constructor(config: ConfigService) {
    this.baseDomain = config.get('APPS_BASE_DOMAIN', 'apps.muntim.ru');
  }

  private compose(subdomain: string): string {
    return `docker compose --project-name ${subdomain} -f docker-compose.yml -f docker-compose.prod.yml`;
  }

  async deploy(appDir: string, subdomain: string): Promise<void> {
    this.logger.log(`Deploying ${subdomain}...`);

    // 1. Build Docker images
    const build = await execAsync(
      `${this.compose(subdomain)} build`,
      { cwd: appDir, timeout: 300_000 },
    );
    if (build.exitCode !== 0) {
      throw new Error(`Docker build failed: ${build.stderr}`);
    }

    // 2. Start containers (DB must be up before migrate)
    const up = await execAsync(
      `${this.compose(subdomain)} up -d`,
      { cwd: appDir, timeout: 120_000 },
    );
    if (up.exitCode !== 0) {
      throw new Error(`Docker compose up failed: ${up.stderr}`);
    }

    // 3. Run prisma migrate deploy (DB is now running inside the container)
    const migrate = await execAsync(
      `${this.compose(subdomain)} exec -T api bunx prisma migrate deploy`,
      { cwd: appDir, timeout: 60_000 },
    );
    if (migrate.exitCode !== 0) {
      throw new Error(`Prisma migrate failed: ${migrate.stderr}`);
    }

    // 4. Health check
    await this.healthCheck(subdomain);

    this.logger.log(`Deployed ${subdomain} successfully`);
  }

  async redeploy(appDir: string, subdomain: string): Promise<void> {
    this.logger.log(`Redeploying ${subdomain}...`);

    const build = await execAsync(
      `${this.compose(subdomain)} build`,
      { cwd: appDir, timeout: 300_000 },
    );
    if (build.exitCode !== 0) {
      throw new Error(`Docker build failed: ${build.stderr}`);
    }

    const up = await execAsync(
      `${this.compose(subdomain)} up -d --force-recreate`,
      { cwd: appDir, timeout: 120_000 },
    );
    if (up.exitCode !== 0) {
      throw new Error(`Docker compose up failed: ${up.stderr}`);
    }

    const migrate = await execAsync(
      `${this.compose(subdomain)} exec -T api bunx prisma migrate deploy`,
      { cwd: appDir, timeout: 60_000 },
    );
    if (migrate.exitCode !== 0) {
      throw new Error(`Prisma migrate failed: ${migrate.stderr}`);
    }

    await this.healthCheck(subdomain);
    this.logger.log(`Redeployed ${subdomain} successfully`);
  }

  async stop(appDir: string, subdomain: string): Promise<void> {
    await execAsync(`${this.compose(subdomain)} down`, { cwd: appDir, timeout: 60_000 });
  }

  private async healthCheck(subdomain: string): Promise<void> {
    const url = `https://${subdomain}.${this.baseDomain}/api/health`;
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT;

    this.logger.log(`Health checking ${url}...`);

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          this.logger.log(`Health check passed for ${subdomain}`);
          return;
        }
      } catch {
        // Expected during container startup
      }
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL));
    }

    throw new Error(`Health check timeout for ${subdomain} after ${HEALTH_CHECK_TIMEOUT}ms`);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd platform/apps/api && bunx jest src/modules/engine/deploy.service.test.ts -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add platform/apps/api/src/modules/engine/deploy.service.ts platform/apps/api/src/modules/engine/deploy.service.test.ts
git commit -m "feat(engine): add deploy service — docker build, compose up, health check"
```

---

## Chunk 4: Pipeline Orchestrator and API

### Task 6: Pipeline service — orchestrate the full create/edit flow

**Files:**
- Create: `platform/apps/api/src/modules/engine/pipeline.service.ts`
- Create: `platform/apps/api/src/modules/engine/pipeline.service.test.ts`

The pipeline service ties together scaffold → codegen → validate → build → deploy. It runs asynchronously, updating app status at each step. On failure, it cleans up (drops DB, removes files) and sets error status.

- [ ] **Step 1: Write the failing test**

```typescript
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
    let execUtilsMock: jest.Mock;

    beforeEach(() => {
      process.env.APPS_DIR = '/tmp';
      // Mock execAsync for checkMigration
      jest.mock('./exec.utils', () => ({
        execAsync: jest.fn().mockResolvedValue({ stdout: 'ALTER TABLE ...', stderr: '', exitCode: 0 }),
      }));
    });

    it('should return null and start deploy when no destructive changes', async () => {
      // Mock checkMigration result (no DROP statements)
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
```

- [ ] **Step 2: Implement pipeline.service.ts**

```typescript
// platform/apps/api/src/modules/engine/pipeline.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ScaffoldService } from './scaffold.service';
import { DatabaseService } from './database.service';
import { CodegenService } from './codegen.service';
import { ValidationService } from './validation.service';
import { DeployService } from './deploy.service';
import { AppsService } from '../apps/apps.service';
import { execAsync } from './exec.utils';
import { AppStatus } from '@prisma/client';
import type { AppSpec } from './prompts';
import * as path from 'path';

const MAX_RETRIES = 3;

export interface MigrationCheck {
  hasDestructiveChanges: boolean;
  sql: string;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private scaffold: ScaffoldService,
    private database: DatabaseService,
    private codegen: CodegenService,
    private validation: ValidationService,
    private deploy: DeployService,
    private apps: AppsService,
  ) {}

  /**
   * Run the full app creation pipeline. Runs async — caller should not await.
   * Updates app status at each step. Cleans up on failure.
   */
  async createApp(
    appId: string,
    userId: string,
    appName: string,
    subdomain: string,
    spec: AppSpec,
  ): Promise<void> {
    let appDir: string | null = null;
    let dbCreated = false;

    try {
      // 0. Update status
      await this.apps.updateStatus(appId, AppStatus.CREATING);
      this.logger.log(`[${subdomain}] Starting pipeline...`);

      // 1. Scaffold
      appDir = await this.scaffold.scaffold(appName, subdomain);

      // 2. Create database
      await this.database.createDatabase(subdomain);
      dbCreated = true;

      // 3. Generate code (with retry on validation failure)
      await this.generateWithRetries(userId, spec, appDir, subdomain);

      // 4. Save spec
      await this.apps.updateSpec(appId, spec);

      // 5. Deploy
      await this.deploy.deploy(appDir, subdomain);

      // 6. Mark as deployed
      await this.apps.markDeployed(appId);
      this.logger.log(`[${subdomain}] Pipeline completed successfully`);
    } catch (error: any) {
      this.logger.error(`[${subdomain}] Pipeline failed: ${error.message}`);
      await this.apps.updateStatus(appId, AppStatus.ERROR, error.message);

      // Cleanup
      if (dbCreated) {
        try { await this.database.dropDatabase(subdomain); } catch {}
      }
      if (appDir) {
        try { await this.scaffold.cleanup(subdomain); } catch {}
      }
    }
  }

  /**
   * Phase 1: Regenerate code, validate, check for destructive migrations.
   * Returns migration check if destructive changes detected (caller must confirm).
   * Does NOT deploy — call confirmEdit() to deploy.
   */
  async prepareEdit(
    appId: string,
    userId: string,
    subdomain: string,
    spec: AppSpec,
  ): Promise<MigrationCheck | null> {
    const appsDir = process.env.APPS_DIR ?? path.join(process.env.HOME!, 'apps');
    const appDir = path.join(appsDir, subdomain);

    try {
      // 1. Regenerate code (don't change app status — app remains RUNNING)
      await this.generateWithRetries(userId, spec, appDir, subdomain);

      // 2. Check for destructive schema changes
      const migrationCheck = await this.checkMigration(appDir, subdomain);
      if (migrationCheck.hasDestructiveChanges) {
        return migrationCheck;
      }

      // 3. No destructive changes — proceed to deploy async
      this.deployEdit(appId, subdomain, appDir, spec);
      return null;
    } catch (error: any) {
      this.logger.error(`[${subdomain}] Edit prepare failed: ${error.message}`);
      await this.apps.updateStatus(appId, AppStatus.ERROR, error.message);
      throw error;
    }
  }

  /**
   * Phase 2: User confirmed destructive migration. Deploy the edit.
   */
  async confirmEdit(appId: string, subdomain: string, spec: AppSpec): Promise<void> {
    const appsDir = process.env.APPS_DIR ?? path.join(process.env.HOME!, 'apps');
    const appDir = path.join(appsDir, subdomain);
    this.deployEdit(appId, subdomain, appDir, spec);
  }

  /**
   * Internal: async deploy after edit (fire-and-forget).
   */
  private async deployEdit(
    appId: string,
    subdomain: string,
    appDir: string,
    spec: AppSpec,
  ): Promise<void> {
    try {
      await this.apps.updateStatus(appId, AppStatus.CREATING);
      await this.apps.updateSpec(appId, spec);
      await this.deploy.redeploy(appDir, subdomain);
      await this.apps.markDeployed(appId);
      this.logger.log(`[${subdomain}] Edit deployed successfully`);
    } catch (error: any) {
      this.logger.error(`[${subdomain}] Edit deploy failed: ${error.message}`);
      await this.apps.updateStatus(appId, AppStatus.ERROR, error.message);
    }
  }

  /**
   * Check if new Prisma schema introduces destructive changes (DROP TABLE/COLUMN).
   */
  private async checkMigration(appDir: string, subdomain: string): Promise<MigrationCheck> {
    const apiDir = `${appDir}/apps/api`;
    const id = subdomain.replace(/-/g, '_');
    const dbUrl = `postgresql://${id}:${id}@localhost:5432/${id}`;

    const result = await execAsync(
      `bunx prisma migrate diff --from-url "${dbUrl}" --to-schema-datamodel ./prisma/schema.prisma --script`,
      { cwd: apiDir, timeout: 30_000 },
    );

    const sql = result.stdout;
    const hasDestructiveChanges = /DROP\s+(TABLE|COLUMN)/i.test(sql);

    return { hasDestructiveChanges, sql };
  }

  private async generateWithRetries(
    userId: string,
    spec: AppSpec,
    appDir: string,
    subdomain: string,
  ): Promise<void> {
    let lastErrors: string[] = [];
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      this.logger.log(`[${subdomain}] Code generation attempt ${attempt}/${MAX_RETRIES}`);
      await this.codegen.generate(userId, spec, appDir, attempt > 1 ? lastErrors : undefined);

      const result = await this.validation.validate(appDir);
      if (result.success) return;

      lastErrors = result.errors;
      this.logger.warn(`[${subdomain}] Validation failed (attempt ${attempt}): ${result.errors.join('\n')}`);

      if (attempt === MAX_RETRIES) {
        throw new Error(`Validation failed after ${MAX_RETRIES} attempts:\n${lastErrors.join('\n')}`);
      }
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd platform/apps/api && bunx jest src/modules/engine/pipeline.service.test.ts -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add platform/apps/api/src/modules/engine/pipeline.service.ts platform/apps/api/src/modules/engine/pipeline.service.test.ts
git commit -m "feat(engine): add pipeline service — orchestrate create app flow with retries"
```

---

### Task 7: Engine module and API endpoint

**Files:**
- Create: `platform/apps/api/src/modules/engine/engine.module.ts`
- Create: `platform/apps/api/src/modules/engine/engine.controller.ts`
- Modify: `platform/apps/api/src/app.module.ts` — add EngineModule import
- Modify: `platform/apps/api/package.json` — add `openai` dependency

- [ ] **Step 1: Create engine.controller.ts**

The controller exposes `POST /apps/:id/generate` which starts the pipeline async and returns immediately. Only the app owner can trigger generation.

```typescript
// platform/apps/api/src/modules/engine/engine.controller.ts
import { Controller, Post, Param, Body, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AppsService } from '../apps/apps.service';
import { PipelineService } from './pipeline.service';
import { AppStatus } from '@prisma/client';
import type { AppSpec } from './prompts';

@ApiTags('Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('apps')
export class EngineController {
  constructor(
    private apps: AppsService,
    private pipeline: PipelineService,
  ) {}

  @Post(':id/generate')
  @ApiOperation({ summary: 'Start app generation pipeline (async)' })
  async generate(
    @CurrentUser() user: { id: string },
    @Param('id') appId: string,
    @Body() body: { spec: AppSpec },
  ) {
    const app = await this.apps.getApp(appId);
    if (app.userId !== user.id) throw new ForbiddenException();
    if (app.status !== AppStatus.CREATING && app.status !== AppStatus.ERROR) {
      throw new BadRequestException('App must be in CREATING or ERROR status to generate');
    }

    if (!body.spec || !body.spec.models || !body.spec.screens) {
      throw new BadRequestException('Invalid spec: models and screens are required');
    }

    // Start pipeline async — don't await
    this.pipeline.createApp(appId, user.id, app.name, app.subdomain, body.spec);

    return { status: 'GENERATING', message: 'Pipeline started' };
  }

  @Post(':id/edit')
  @ApiOperation({ summary: 'Edit deployed app — regenerate code, check migration, deploy' })
  async edit(
    @CurrentUser() user: { id: string },
    @Param('id') appId: string,
    @Body() body: { spec: AppSpec },
  ) {
    const app = await this.apps.getApp(appId);
    if (app.userId !== user.id) throw new ForbiddenException();
    if (app.status !== AppStatus.RUNNING) {
      throw new BadRequestException('App must be RUNNING to edit');
    }

    if (!body.spec || !body.spec.models || !body.spec.screens) {
      throw new BadRequestException('Invalid spec: models and screens are required');
    }

    // Phase 1: regenerate + validate + check migration (sync — returns quickly after codegen)
    // If no destructive changes, Phase 2 (deploy) starts async inside prepareEdit
    const migrationCheck = await this.pipeline.prepareEdit(appId, user.id, app.subdomain, body.spec);

    if (migrationCheck?.hasDestructiveChanges) {
      return {
        status: 'DESTRUCTIVE_MIGRATION',
        message: 'Destructive schema changes detected — confirm to proceed',
        sql: migrationCheck.sql,
      };
    }

    return { status: 'UPDATING', message: 'Edit pipeline started' };
  }

  @Post(':id/edit/confirm')
  @ApiOperation({ summary: 'Confirm destructive migration and deploy edit' })
  async confirmEdit(
    @CurrentUser() user: { id: string },
    @Param('id') appId: string,
    @Body() body: { spec: AppSpec },
  ) {
    const app = await this.apps.getApp(appId);
    if (app.userId !== user.id) throw new ForbiddenException();

    // Fire-and-forget the deploy
    this.pipeline.confirmEdit(appId, app.subdomain, body.spec);

    return { status: 'UPDATING', message: 'Confirmed — deploying' };
  }
}
```

- [ ] **Step 2: Create engine.module.ts**

```typescript
// platform/apps/api/src/modules/engine/engine.module.ts
import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module';
import { AiAccessModule } from '../ai-access/ai-access.module';
import { EngineController } from './engine.controller';
import { PipelineService } from './pipeline.service';
import { ScaffoldService } from './scaffold.service';
import { DatabaseService } from './database.service';
import { CodegenService } from './codegen.service';
import { ValidationService } from './validation.service';
import { DeployService } from './deploy.service';

@Module({
  imports: [AppsModule, AiAccessModule],
  controllers: [EngineController],
  providers: [
    PipelineService,
    ScaffoldService,
    DatabaseService,
    CodegenService,
    ValidationService,
    DeployService,
  ],
})
export class EngineModule {}
```

- [ ] **Step 3: Update app.module.ts**

```typescript
// platform/apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AppsModule } from './modules/apps/apps.module';
import { AiAccessModule } from './modules/ai-access/ai-access.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { EngineModule } from './modules/engine/engine.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AppsModule,
    AiAccessModule,
    TelegramModule,
    EngineModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Update .env.example with new variables**

Add to `platform/.env.example`:

```env
# App Engine
TEMPLATE_PATH=/path/to/ilmarinen/template
APPS_DIR=/home/user/apps
DATABASE_HOST=postgres
OPENAI_MODEL=gpt-4o
```

- [ ] **Step 5: Commit**

```bash
git add platform/apps/api/src/modules/engine/engine.module.ts platform/apps/api/src/modules/engine/engine.controller.ts platform/apps/api/src/app.module.ts platform/.env.example
git commit -m "feat(engine): add engine module with API endpoint and wire all services"
```

---

## Chunk 5: Validation

### Task 8: Validate engine builds and run all tests

- [ ] **Step 1: Install dependencies**

```bash
cd platform && bun install
```

Expected: Success, all workspace dependencies installed (including `openai`).

- [ ] **Step 2: TypeScript check**

```bash
cd platform/apps/api && bunx prisma generate && bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run all tests**

```bash
cd platform/apps/api && bunx jest
```

Expected: All tests pass (auth, apps, ai-access, telegram, scaffold, database, codegen, validation, deploy, pipeline).

- [ ] **Step 4: Commit fixes if needed**

```bash
git add platform/ && git commit -m "fix(engine): address build validation issues"
```

Only if fixes were needed.
