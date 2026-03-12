# Platform Core Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Ilmarinen platform — the web application where users manage their apps, authenticate, handle AI access, and where generated apps delegate auth and Telegram connections.

**Architecture:** NestJS + React monorepo at `platform/` in the ilmarinen repo. Google OAuth for user login, symmetric JWT for platform sessions, RSA-signed JWT for app auth delegation. AI key encryption with AES-256-GCM. PostgreSQL serves as the shared database for both the platform and all generated apps. Chat UI and App Engine are out of scope (Plan 3).

**Tech Stack:** Bun, NestJS 11, React 19, Vite 7, TanStack Router, Tailwind CSS 4, shadcn/ui, Prisma, PostgreSQL 16, Docker, Caddy, i18next, Passport.js (Google OAuth + JWT), OpenAI API

---

## Chunk 1: Project Scaffold and Infrastructure

### Task 1: Root project structure

**Files:**
- Create: `platform/package.json`
- Create: `platform/.gitignore`
- Create: `platform/.env.example`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "ilmarinen",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "bash ./scripts/dev-start.sh",
    "dev:stop": "bash ./scripts/dev-stop.sh",
    "docker:build": "docker compose -f docker-compose.yml -f docker-compose.prod.yml build api web",
    "docker:push": "docker compose -f docker-compose.yml -f docker-compose.prod.yml push api web"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.env
*.log
tmp/
```

- [ ] **Step 3: Create .env.example**

```env
# Database (shared PostgreSQL for platform + all generated app databases)
DATABASE_URL=postgresql://ilmarinen:ilmarinen@postgres:5432/ilmarinen

# Auth
JWT_SECRET=change-me-in-production
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# RSA key pair for signing JWTs for generated apps
# Generate with: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -outform PEM
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# AI key encryption (AES-256-GCM, must be at least 32 characters)
AI_KEY_ENCRYPTION_SECRET=change-me-32-chars-minimum-secret

# Admin
ADMIN_EMAILS=admin@example.com

# Internal API secret (shared between platform and generated apps)
INTERNAL_API_SECRET=change-me-random-secret

# Telegram (used by Plan 4 — Telegram Bot)
TELEGRAM_BOT_TOKEN=

# Apps domain (used for app auth delegation redirects)
APPS_BASE_DOMAIN=apps.muntim.ru

# Frontend (Vite)
VITE_APPS_BASE_DOMAIN=apps.muntim.ru

# Ports
API_PORT=3001
```

- [ ] **Step 4: Commit**

```bash
git add platform/package.json platform/.gitignore platform/.env.example
git commit -m "feat(platform): add root project structure"
```

---

### Task 2: Docker infrastructure

**Files:**
- Create: `platform/docker-compose.yml`
- Create: `platform/docker-compose.dev.yml`
- Create: `platform/docker-compose.prod.yml`
- Create: `platform/Caddyfile`

- [ ] **Step 1: Create base docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ilmarinen
      POSTGRES_PASSWORD: ilmarinen
      POSTGRES_DB: ilmarinen
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ilmarinen"]
      interval: 2s
      timeout: 5s
      retries: 10

  api:
    build:
      context: ./apps/api
      target: dev
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    command: sh -c "bunx prisma migrate deploy && bun run dev"

  web:
    build:
      context: ./apps/web
      target: dev
    depends_on:
      - api

volumes:
  pgdata:
```

- [ ] **Step 2: Create docker-compose.dev.yml**

```yaml
services:
  postgres:
    ports:
      - "5432:5432"

  api:
    volumes:
      - ./apps/api/src:/app/src
      - ./apps/api/prisma:/app/prisma
    ports:
      - "3001:3001"

  web:
    volumes:
      - ./apps/web/src:/app/src
    ports:
      - "5173:5173"

  caddy:
    image: caddy:2-alpine
    ports:
      - "3000:3000"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - api
      - web
```

- [ ] **Step 3: Create docker-compose.prod.yml**

```yaml
services:
  postgres:
    profiles:
      - dev-only

  api:
    build:
      target: prod
    restart: unless-stopped
    environment:
      NODE_ENV: production
    command: sh -c "bunx prisma migrate deploy && node dist/main.js"
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    networks:
      default:
      gateway:
        aliases:
          - ilmarinen-api

  web:
    build:
      target: prod
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.25"
    networks:
      default:
      gateway:
        aliases:
          - ilmarinen-web

networks:
  gateway:
    external: true
    name: muntim_gateway
```

Note: Platform API gets more resources (512M, 1 CPU) than generated apps (256M, 0.5 CPU) because it handles AI requests, app building, etc. In prod, postgres is disabled — the platform shares the host PostgreSQL or a separate managed instance.

- [ ] **Step 4: Create Caddyfile (for dev)**

```
:3000 {
    handle /api/* {
        reverse_proxy api:3001
    }
    handle {
        reverse_proxy web:5173
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add platform/docker-compose.yml platform/docker-compose.dev.yml platform/docker-compose.prod.yml platform/Caddyfile
git commit -m "feat(platform): add Docker infrastructure"
```

---

### Task 3: Scripts

**Files:**
- Create: `platform/bin/deploy.sh`
- Create: `platform/scripts/dev-start.sh`
- Create: `platform/scripts/dev-stop.sh`

- [ ] **Step 1: Create deploy.sh**

```bash
#!/bin/sh
set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "Starting services..."
$COMPOSE up -d --force-recreate

echo "Done. Running containers:"
$COMPOSE ps
```

- [ ] **Step 2: Create dev-start.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Starting Docker dev stack..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- [ ] **Step 3: Create dev-stop.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Stopping Docker dev stack..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

echo "Docker dev stack stopped."
```

- [ ] **Step 4: Make scripts executable and commit**

```bash
chmod +x platform/bin/deploy.sh platform/scripts/dev-start.sh platform/scripts/dev-stop.sh
git add platform/bin/ platform/scripts/
git commit -m "feat(platform): add deploy and dev scripts"
```

---

### Task 4: API skeleton — Prisma schema and NestJS bootstrap

**Files:**
- Create: `platform/apps/api/package.json`
- Create: `platform/apps/api/tsconfig.json`
- Create: `platform/apps/api/nest-cli.json`
- Create: `platform/apps/api/jest.config.js`
- Create: `platform/apps/api/Dockerfile`
- Create: `platform/apps/api/.dockerignore`
- Create: `platform/apps/api/prisma/schema.prisma`
- Create: `platform/apps/api/src/main.ts`
- Create: `platform/apps/api/src/app.module.ts`
- Create: `platform/apps/api/src/prisma/prisma.service.ts`
- Create: `platform/apps/api/src/prisma/prisma.module.ts`

- [ ] **Step 1: Create apps/api/package.json**

```json
{
  "name": "api",
  "private": true,
  "scripts": {
    "dev": "bun run --watch src/main.ts",
    "build": "nest build",
    "start": "node dist/main.js",
    "test": "jest",
    "prisma:generate": "bunx prisma generate",
    "prisma:migrate": "bunx prisma migrate dev"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.16",
    "@nestjs/testing": "^11.1.16",
    "@types/bun": "latest",
    "@types/express": "^5.0.6",
    "@types/jest": "^29.5.14",
    "@types/passport-google-oauth20": "^2.0.16",
    "@types/passport-jwt": "^4.0.1",
    "jest": "^29.7.0",
    "prisma": "5",
    "ts-jest": "^29.3.4"
  },
  "peerDependencies": {
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.16",
    "@nestjs/config": "^4.0.3",
    "@nestjs/core": "^11.1.16",
    "@nestjs/jwt": "^11.0.2",
    "@nestjs/passport": "^11.0.5",
    "@nestjs/platform-express": "^11.1.16",
    "@nestjs/swagger": "^11.2.6",
    "@prisma/client": "5",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "express": "^5.2.1",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  }
}
```

- [ ] **Step 2: Create apps/api/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "types": ["jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create apps/api/nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 4: Create apps/api/jest.config.js**

```javascript
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.test\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

- [ ] **Step 5: Create apps/api/Dockerfile**

```dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lockb* ./
COPY prisma ./prisma/
RUN bun install

COPY . .
RUN bunx prisma generate

FROM base AS dev

CMD ["bun", "run", "--watch", "src/main.ts"]

FROM base AS prod

RUN bun run build

CMD ["node", "dist/main.js"]
```

- [ ] **Step 6: Create apps/api/.dockerignore**

```
node_modules
dist
```

- [ ] **Step 7: Create apps/api/prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  googleId  String   @unique
  email     String   @unique
  name      String?
  locale    String   @default("ru")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  apps                App[]
  chatSessions        ChatSession[]
  aiKeys              AiKey[]
  aiAccessRequests    AiAccessRequest[]
  telegramConnections TelegramConnection[]
}

enum AppStatus {
  CREATING
  RUNNING
  STOPPED
  ERROR
}

model App {
  id          String    @id @default(uuid())
  name        String
  subdomain   String    @unique
  status      AppStatus @default(CREATING)
  spec        Json?
  errorReason String?
  generatedAt DateTime?
  deployedAt  DateTime?
  userId      String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions            AppVersion[]
  chatSessions        ChatSession[]
  telegramConnections TelegramConnection[]
}

model AppVersion {
  id        String   @id @default(uuid())
  version   Int
  spec      Json
  appId     String
  createdAt DateTime @default(now())

  app App @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@unique([appId, version])
}

model TelegramConnection {
  id        String   @id @default(uuid())
  chatId    String
  userId    String
  appId     String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  app  App  @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@unique([userId, appId])
}

model ChatSession {
  id        String   @id @default(uuid())
  userId    String
  appId     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  app      App?          @relation(fields: [appId], references: [id], onDelete: SetNull)
  messages ChatMessage[]
}

model ChatMessage {
  id        String   @id @default(uuid())
  role      String
  content   String
  sessionId String
  createdAt DateTime @default(now())

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

enum AiAccessRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

model AiAccessRequest {
  id        String                @id @default(uuid())
  status    AiAccessRequestStatus @default(PENDING)
  userId    String
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AiKey {
  id           String   @id @default(uuid())
  encryptedKey String
  provider     String   @default("openai")
  userId       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 8: Create apps/api/src/prisma/prisma.service.ts**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

- [ ] **Step 9: Create apps/api/src/prisma/prisma.module.ts**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 10: Create apps/api/src/main.ts**

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Ilmarinen API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  console.log(`Ilmarinen API running on http://localhost:${port}`);
}
bootstrap();
```

- [ ] **Step 11: Create apps/api/src/app.module.ts**

Note: Start with only the modules that exist in Chunk 1. Subsequent chunks add their module imports as they create the modules. `ConfigModule.forRoot({ isGlobal: true })` makes ConfigService available everywhere.

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 12: Commit**

```bash
git add platform/apps/api/
git commit -m "feat(platform): add API skeleton with Prisma schema and NestJS bootstrap"
```

---

## Chunk 2: Auth and Users

### Task 5: Auth module — Google OAuth + JWT

**Files:**
- Create: `platform/apps/api/src/modules/auth/auth.module.ts`
- Create: `platform/apps/api/src/modules/auth/auth.controller.ts`
- Create: `platform/apps/api/src/modules/auth/auth.service.ts`
- Create: `platform/apps/api/src/modules/auth/auth.service.test.ts`
- Create: `platform/apps/api/src/modules/auth/strategies/google.strategy.ts`
- Create: `platform/apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- Create: `platform/apps/api/src/modules/auth/guards/google-auth.guard.ts`
- Create: `platform/apps/api/src/modules/auth/guards/jwt-auth.guard.ts`
- Create: `platform/apps/api/src/modules/auth/guards/admin.guard.ts`
- Create: `platform/apps/api/src/modules/auth/decorators/current-user.decorator.ts`
- Modify: `platform/apps/api/src/app.module.ts` — add AuthModule import

- [ ] **Step 1: Write the failing test for auth service**

```typescript
// platform/apps/api/src/modules/auth/auth.service.test.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: { upsert: jest.Mock } };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { upsert: jest.fn() } };
    jwtService = { sign: jest.fn().mockReturnValue('mock-token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const values: Record<string, string> = {
                RSA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('validateOAuthLogin', () => {
    it('should upsert user and return user data', async () => {
      const user = { id: 'u1', email: 'test@example.com', name: 'Test', googleId: 'g1' };
      prisma.user.upsert.mockResolvedValue(user);

      const result = await authService.validateOAuthLogin({
        googleId: 'g1',
        email: 'test@example.com',
        name: 'Test',
      });

      expect(result).toEqual(user);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { googleId: 'g1' },
        update: { email: 'test@example.com', name: 'Test' },
        create: { googleId: 'g1', email: 'test@example.com', name: 'Test' },
      });
    });
  });

  describe('generateToken', () => {
    it('should generate JWT with user data', () => {
      const token = authService.generateToken({ id: 'u1', email: 'test@example.com' });
      expect(token).toBe('mock-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'u1', email: 'test@example.com' },
      );
    });
  });

  describe('generateAppToken', () => {
    it('should generate RSA-signed JWT for app delegation', () => {
      const token = authService.generateAppToken(
        { id: 'u1', email: 'test@example.com', name: 'Test' },
        'my-pet',
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'u1', email: 'test@example.com', name: 'Test', app: 'my-pet' },
        { privateKey: expect.any(String), algorithm: 'RS256', expiresIn: '7d' },
      );
    });
  });
});
```

- [ ] **Step 2: Implement auth.service.ts**

```typescript
// platform/apps/api/src/modules/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly rsaPrivateKey: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {
    this.rsaPrivateKey = this.config.getOrThrow('RSA_PRIVATE_KEY');
  }

  async validateOAuthLogin(data: { googleId: string; email: string; name: string | null }) {
    return this.prisma.user.upsert({
      where: { googleId: data.googleId },
      update: { email: data.email, name: data.name },
      create: { googleId: data.googleId, email: data.email, name: data.name },
    });
  }

  generateToken(user: { id: string; email: string }): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  generateAppToken(
    user: { id: string; email: string; name: string | null },
    appSubdomain: string,
  ): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, name: user.name, app: appSubdomain },
      { privateKey: this.rsaPrivateKey, algorithm: 'RS256', expiresIn: '7d' },
    );
  }
}
```

- [ ] **Step 3: Create Google OAuth strategy**

```typescript
// platform/apps/api/src/modules/auth/strategies/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: { id: string; emails?: { value: string }[]; displayName?: string },
    done: VerifyCallback,
  ) {
    done(null, {
      googleId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      name: profile.displayName ?? null,
    });
  }
}
```

- [ ] **Step 4: Create JWT strategy (symmetric — for platform auth)**

```typescript
// platform/apps/api/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  }
}
```

- [ ] **Step 5: Create guards**

```typescript
// platform/apps/api/src/modules/auth/guards/google-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const returnApp = request.query.returnApp;
    if (returnApp) {
      return { state: JSON.stringify({ returnApp }) };
    }
    return {};
  }
}
```

```typescript
// platform/apps/api/src/modules/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```typescript
// platform/apps/api/src/modules/auth/guards/admin.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<{ user?: { email?: string } }>();
    const email = request.user?.email;
    if (!email) throw new ForbiddenException('ADMIN_ONLY');

    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!adminEmails.includes(email.toLowerCase())) {
      throw new ForbiddenException('ADMIN_ONLY');
    }
    return true;
  }
}
```

- [ ] **Step 6: Create current-user decorator**

```typescript
// platform/apps/api/src/modules/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 7: Create auth controller**

The Google OAuth flow:
- `GET /auth/google?returnApp=<subdomain>` — redirects to Google. If `returnApp` query param is present, it's stored in OAuth state for app auth delegation.
- `GET /auth/google/callback` — handles OAuth callback. If state has `returnApp`, generates RSA JWT and redirects to the app. Otherwise generates platform JWT and redirects to frontend.
- `GET /auth/app-login?app=<subdomain>` — convenience redirect that sends user through Google OAuth with the app subdomain.

```typescript
// platform/apps/api/src/modules/auth/auth.controller.ts
import { Controller, Get, Req, Res, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  google() {
    // Guard handles redirect
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as { googleId: string; email: string; name: string | null };
    const user = await this.authService.validateOAuthLogin(profile);

    // Check if this is an app auth delegation flow
    const state = this.parseState(req.query.state as string | undefined);
    if (state?.returnApp) {
      const appToken = this.authService.generateAppToken(user, state.returnApp);
      const baseDomain = this.config.get('APPS_BASE_DOMAIN', 'apps.muntim.ru');
      return res.redirect(
        `https://${state.returnApp}.${baseDomain}/api/auth/callback?token=${appToken}`,
      );
    }

    // Normal platform login
    const token = this.authService.generateToken(user);
    return res.redirect(`/#token=${token}`);
  }

  @Get('app-login')
  @ApiOperation({ summary: 'App auth delegation — redirects through Google OAuth' })
  appLogin(@Query('app') app: string, @Res() res: Response) {
    if (!app || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(app)) {
      throw new BadRequestException('Invalid app subdomain');
    }
    return res.redirect(`/api/auth/google?returnApp=${encodeURIComponent(app)}`);
  }

  private parseState(state: string | undefined): { returnApp?: string } | null {
    if (!state) return null;
    try {
      return JSON.parse(state);
    } catch {
      return null;
    }
  }
}
```

Note: The `state` parameter passing through Google OAuth requires configuring the strategy to forward it. Passport-google-oauth20 supports `passReqToCallback` and custom state params. The `state` query param on `/auth/google` is automatically forwarded by Passport's Google strategy to Google and back.

- [ ] **Step 8: Create auth.module.ts**

```typescript
// platform/apps/api/src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 9: Update app.module.ts to add AuthModule**

Add to imports in `platform/apps/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 10: Commit**

```bash
git add platform/apps/api/src/modules/auth/ platform/apps/api/src/app.module.ts
git commit -m "feat(platform): add auth module with Google OAuth and JWT"
```

---

### Task 6: Users module

**Files:**
- Create: `platform/apps/api/src/modules/users/users.module.ts`
- Create: `platform/apps/api/src/modules/users/users.controller.ts`
- Create: `platform/apps/api/src/modules/users/users.service.ts`
- Create: `platform/apps/api/src/modules/users/update-user.dto.ts`
- Modify: `platform/apps/api/src/app.module.ts` — add UsersModule import

- [ ] **Step 1: Create users.service.ts**

```typescript
// platform/apps/api/src/modules/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly adminEmails: string[];

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.adminEmails = (config.get<string>('ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    return { ...user, isAdmin: this.adminEmails.includes(user.email.toLowerCase()) };
  }

  async updateUser(id: string, data: { name?: string; locale?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }
}
```

- [ ] **Step 2: Create users.controller.ts**

```typescript
// platform/apps/api/src/modules/users/users.controller.ts
import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.getUser(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: { id: string },
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.updateUser(user.id, data);
  }
}
```

```typescript
// platform/apps/api/src/modules/users/update-user.dto.ts
import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['ru', 'en'])
  locale?: string;
}
```

- [ ] **Step 3: Create users.module.ts**

```typescript
// platform/apps/api/src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Update app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Commit**

```bash
git add platform/apps/api/src/modules/users/ platform/apps/api/src/app.module.ts
git commit -m "feat(platform): add users module"
```

---

## Chunk 3: Core API Modules

### Task 7: Apps module — CRUD and lifecycle

**Files:**
- Create: `platform/apps/api/src/modules/apps/apps.module.ts`
- Create: `platform/apps/api/src/modules/apps/apps.controller.ts`
- Create: `platform/apps/api/src/modules/apps/apps.service.ts`
- Create: `platform/apps/api/src/modules/apps/apps.service.test.ts`
- Create: `platform/apps/api/src/modules/apps/create-app.dto.ts`
- Modify: `platform/apps/api/src/app.module.ts` — add AppsModule import

- [ ] **Step 1: Write failing test for apps service**

```typescript
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
```

- [ ] **Step 2: Implement apps.service.ts**

```typescript
// platform/apps/api/src/modules/apps/apps.service.ts
import { Injectable } from '@nestjs/common';
import { AppStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AppsService {
  constructor(private prisma: PrismaService) {}

  async getUserApps(userId: string) {
    return this.prisma.app.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApp(id: string) {
    return this.prisma.app.findUniqueOrThrow({ where: { id } });
  }

  async createApp(userId: string, data: { name: string; subdomain: string }) {
    return this.prisma.app.create({
      data: { ...data, userId },
    });
  }

  async updateStatus(id: string, status: AppStatus, errorReason?: string) {
    return this.prisma.app.update({
      where: { id },
      data: { status, ...(errorReason ? { errorReason } : {}) },
    });
  }

  async updateSpec(id: string, spec: object) {
    return this.prisma.app.update({
      where: { id },
      data: { spec: spec as any },
    });
  }

  async markDeployed(id: string) {
    return this.prisma.app.update({
      where: { id },
      data: { status: 'RUNNING' as AppStatus, deployedAt: new Date(), errorReason: null },
    });
  }
}
```

- [ ] **Step 3: Create apps.controller.ts**

```typescript
// platform/apps/api/src/modules/apps/apps.controller.ts
import { Controller, Get, Post, Patch, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AppStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AppsService } from './apps.service';
import { CreateAppDto } from './create-app.dto';

@ApiTags('Apps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('apps')
export class AppsController {
  constructor(private appsService: AppsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user apps' })
  getMyApps(@CurrentUser() user: { id: string }) {
    return this.appsService.getUserApps(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get app by ID' })
  async getApp(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const app = await this.appsService.getApp(id);
    if (app.userId !== user.id) throw new ForbiddenException();
    return app;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new app (starts the creation pipeline)' })
  createApp(
    @CurrentUser() user: { id: string },
    @Body() data: CreateAppDto,
  ) {
    return this.appsService.createApp(user.id, data);
  }

  @Patch(':id/stop')
  @ApiOperation({ summary: 'Stop a running app' })
  async stopApp(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const app = await this.appsService.getApp(id);
    if (app.userId !== user.id) throw new ForbiddenException();
    return this.appsService.updateStatus(id, AppStatus.STOPPED);
  }
}
```

```typescript
// platform/apps/api/src/modules/apps/create-app.dto.ts
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateAppDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/, {
    message: 'subdomain must be lowercase alphanumeric with hyphens, 3-64 chars',
  })
  subdomain: string;
}
```

- [ ] **Step 4: Create apps.module.ts**

```typescript
// platform/apps/api/src/modules/apps/apps.module.ts
import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

@Module({
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService],
})
export class AppsModule {}
```

- [ ] **Step 5: Update app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AppsModule } from './modules/apps/apps.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AppsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Commit**

```bash
git add platform/apps/api/src/modules/apps/ platform/apps/api/src/app.module.ts
git commit -m "feat(platform): add apps module with CRUD and lifecycle"
```

---

### Task 8: AI Access module — key encryption, access requests, admin

**Files:**
- Create: `platform/apps/api/src/modules/ai-access/ai-access.module.ts`
- Create: `platform/apps/api/src/modules/ai-access/ai-access.controller.ts`
- Create: `platform/apps/api/src/modules/ai-access/ai-access.service.ts`
- Create: `platform/apps/api/src/modules/ai-access/ai-access.service.test.ts`
- Create: `platform/apps/api/src/modules/ai-access/admin-ai-access.controller.ts`
- Modify: `platform/apps/api/src/app.module.ts` — add AiAccessModule import

- [ ] **Step 1: Write failing test for AI access service**

```typescript
// platform/apps/api/src/modules/ai-access/ai-access.service.test.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiAccessService } from './ai-access.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AiAccessService', () => {
  let service: AiAccessService;
  let prisma: {
    aiKey: { findFirst: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    aiAccessRequest: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      aiKey: { findFirst: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      aiAccessRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        AiAccessService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('a]b[c!d@e#f$g%h^i&j*k(l)m_n+o=p') },
        },
      ],
    }).compile();

    service = module.get(AiAccessService);
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt a key correctly', () => {
      const original = 'sk-test-key-1234567890';
      const encrypted = (service as any).encrypt(original);

      expect(encrypted).not.toBe(original);
      expect(encrypted.startsWith('v1:')).toBe(true);

      const decrypted = (service as any).decrypt(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe('resolveApiKey', () => {
    it('should return user own key if available', async () => {
      prisma.aiKey.findFirst.mockResolvedValueOnce({ encryptedKey: 'v1:fake' });

      // We can't easily test decryption with mock data, so just verify the flow
      const encrypted = (service as any).encrypt('sk-user-key');
      prisma.aiKey.findFirst.mockReset();
      prisma.aiKey.findFirst.mockResolvedValueOnce({ encryptedKey: encrypted });

      const result = await service.resolveApiKey('u1');

      expect(result).toBe('sk-user-key');
      expect(prisma.aiKey.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('should fall back to platform shared key if user has approved request', async () => {
      prisma.aiKey.findFirst
        .mockResolvedValueOnce(null); // no user key

      const encrypted = (service as any).encrypt('sk-platform-key');
      prisma.aiAccessRequest.findFirst.mockResolvedValue({ status: 'APPROVED' });
      prisma.aiKey.findFirst.mockResolvedValueOnce({ encryptedKey: encrypted }); // platform key

      const result = await service.resolveApiKey('u1');
      expect(result).toBe('sk-platform-key');
    });

    it('should return null if no key available', async () => {
      prisma.aiKey.findFirst.mockResolvedValue(null);
      prisma.aiAccessRequest.findFirst.mockResolvedValue(null);

      const result = await service.resolveApiKey('u1');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Implement ai-access.service.ts**

Encryption pattern from bloodyssey: AES-256-GCM with versioned format `v1:iv:authTag:encryptedData`.

```typescript
// platform/apps/api/src/modules/ai-access/ai-access.service.ts
import * as crypto from 'crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiAccessService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Resolve the OpenAI API key for a user. Priority: own key > approved request + platform key > null. */
  async resolveApiKey(userId: string): Promise<string | null> {
    // 1. Check user's own key
    const userKey = await this.prisma.aiKey.findFirst({ where: { userId } });
    if (userKey) return this.decrypt(userKey.encryptedKey);

    // 2. Check if user has approved access request
    const approved = await this.prisma.aiAccessRequest.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!approved) return null;

    // 3. Get platform shared key
    const platformKey = await this.prisma.aiKey.findFirst({ where: { userId: null } });
    if (!platformKey) return null;

    return this.decrypt(platformKey.encryptedKey);
  }

  async setUserKey(userId: string, apiKey: string) {
    const encrypted = this.encrypt(apiKey);
    // Delete existing key if any, then create new
    await this.prisma.aiKey.deleteMany({ where: { userId } });
    return this.prisma.aiKey.create({
      data: { encryptedKey: encrypted, userId, provider: 'openai' },
    });
  }

  async removeUserKey(userId: string) {
    await this.prisma.aiKey.deleteMany({ where: { userId } });
  }

  async requestAccess(userId: string) {
    const existing = await this.prisma.aiAccessRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (existing) return existing;
    return this.prisma.aiAccessRequest.create({ data: { userId } });
  }

  async getAccessStatus(userId: string) {
    const userKey = await this.prisma.aiKey.findFirst({ where: { userId } });
    if (userKey) return { hasOwnKey: true, requestStatus: null };

    const request = await this.prisma.aiAccessRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { hasOwnKey: false, requestStatus: request?.status ?? null };
  }

  // --- Admin methods ---

  async getPendingRequests() {
    return this.prisma.aiAccessRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveRequest(requestId: string) {
    return this.prisma.aiAccessRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED' },
    });
  }

  async rejectRequest(requestId: string) {
    return this.prisma.aiAccessRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });
  }

  async setPlatformKey(apiKey: string) {
    const encrypted = this.encrypt(apiKey);
    await this.prisma.aiKey.deleteMany({ where: { userId: null } });
    return this.prisma.aiKey.create({
      data: { encryptedKey: encrypted, provider: 'openai' },
    });
  }

  // --- Encryption ---

  private encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(encryptedValue: string): string {
    const parts = encryptedValue.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new InternalServerErrorException('AI_KEY_DECRYPT_FAILED');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private encryptionKey(): Buffer {
    const secret = this.config.get<string>('AI_KEY_ENCRYPTION_SECRET');
    if (!secret) throw new InternalServerErrorException('AI_KEY_ENCRYPTION_SECRET_MISSING');
    return crypto.createHash('sha256').update(secret).digest();
  }
}
```

- [ ] **Step 3: Create ai-access.controller.ts (user-facing)**

```typescript
// platform/apps/api/src/modules/ai-access/ai-access.controller.ts
import { Controller, Get, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiAccessService } from './ai-access.service';

@ApiTags('AI Access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-access')
export class AiAccessController {
  constructor(private aiAccessService: AiAccessService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get AI access status for current user' })
  getStatus(@CurrentUser() user: { id: string }) {
    return this.aiAccessService.getAccessStatus(user.id);
  }

  @Post('key')
  @ApiOperation({ summary: 'Set own OpenAI API key' })
  async setKey(@CurrentUser() user: { id: string }, @Body() body: { apiKey: string }) {
    await this.aiAccessService.setUserKey(user.id, body.apiKey);
    return { success: true };
  }

  @Delete('key')
  @ApiOperation({ summary: 'Remove own API key' })
  async removeKey(@CurrentUser() user: { id: string }) {
    await this.aiAccessService.removeUserKey(user.id);
    return { success: true };
  }

  @Post('request')
  @ApiOperation({ summary: 'Request free AI access' })
  async requestAccess(@CurrentUser() user: { id: string }) {
    const req = await this.aiAccessService.requestAccess(user.id);
    return { id: req.id, status: req.status };
  }
}
```

- [ ] **Step 4: Create admin-ai-access.controller.ts**

```typescript
// platform/apps/api/src/modules/ai-access/admin-ai-access.controller.ts
import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AiAccessService } from './ai-access.service';

@ApiTags('Admin — AI Access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/ai-access')
export class AdminAiAccessController {
  constructor(private aiAccessService: AiAccessService) {}

  @Get('requests')
  @ApiOperation({ summary: 'List pending AI access requests' })
  getPendingRequests() {
    return this.aiAccessService.getPendingRequests();
  }

  @Post('requests/:id/approve')
  @ApiOperation({ summary: 'Approve an AI access request' })
  approve(@Param('id') id: string) {
    return this.aiAccessService.approveRequest(id);
  }

  @Post('requests/:id/reject')
  @ApiOperation({ summary: 'Reject an AI access request' })
  reject(@Param('id') id: string) {
    return this.aiAccessService.rejectRequest(id);
  }

  @Post('platform-key')
  @ApiOperation({ summary: 'Set the platform shared OpenAI API key' })
  setPlatformKey(@Body() body: { apiKey: string }) {
    return this.aiAccessService.setPlatformKey(body.apiKey);
  }
}
```

- [ ] **Step 5: Create ai-access.module.ts**

```typescript
// platform/apps/api/src/modules/ai-access/ai-access.module.ts
import { Module } from '@nestjs/common';
import { AiAccessController } from './ai-access.controller';
import { AdminAiAccessController } from './admin-ai-access.controller';
import { AiAccessService } from './ai-access.service';

@Module({
  controllers: [AiAccessController, AdminAiAccessController],
  providers: [AiAccessService],
  exports: [AiAccessService],
})
export class AiAccessModule {}
```

- [ ] **Step 6: Update app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AppsModule } from './modules/apps/apps.module';
import { AiAccessModule } from './modules/ai-access/ai-access.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AppsModule,
    AiAccessModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Commit**

```bash
git add platform/apps/api/src/modules/ai-access/ platform/apps/api/src/app.module.ts
git commit -m "feat(platform): add AI access module with key encryption and admin"
```

---

### Task 9: Telegram API module — connect-token and chat-id resolution

These are the API endpoints that generated apps call to manage Telegram connections. The actual Telegram bot (long polling, /start handler) is Plan 4.

**Files:**
- Create: `platform/apps/api/src/modules/telegram/telegram.module.ts`
- Create: `platform/apps/api/src/modules/telegram/telegram.controller.ts`
- Create: `platform/apps/api/src/modules/telegram/telegram.service.ts`
- Create: `platform/apps/api/src/modules/telegram/telegram.service.test.ts`
- Create: `platform/apps/api/src/modules/telegram/internal-api.guard.ts`
- Modify: `platform/apps/api/src/app.module.ts` — add TelegramModule import

- [ ] **Step 1: Write failing test for telegram service**

```typescript
// platform/apps/api/src/modules/telegram/telegram.service.test.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let prisma: {
    telegramConnection: { findUnique: jest.Mock; findFirst: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      telegramConnection: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-secret-for-hmac-signing') },
        },
      ],
    }).compile();

    service = module.get(TelegramService);
  });

  describe('generateConnectToken', () => {
    it('should generate an HMAC-signed token and resolve it', () => {
      const token = service.generateConnectToken('u1', 'my-pet');
      expect(typeof token).toBe('string');
      expect(token).toContain('.'); // payload.signature format

      const decoded = service.resolveConnectToken(token);
      expect(decoded).toEqual({ userId: 'u1', appSubdomain: 'my-pet' });
    });

    it('should reject a tampered token', () => {
      const token = service.generateConnectToken('u1', 'my-pet');
      const tampered = token.replace('u1', 'u2');
      expect(service.resolveConnectToken(tampered)).toBeNull();
    });
  });

  describe('getChatId', () => {
    it('should return chatId if connection exists', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue({ chatId: '12345' });

      const result = await service.getChatId('u1', 'app1');
      expect(result).toBe('12345');
    });

    it('should return null if no connection', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue(null);

      const result = await service.getChatId('u1', 'app1');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Implement telegram.service.ts**

The connect token is a base64-encoded JSON string with a short TTL. In Plan 4 (Telegram Bot), the bot's /start handler will call `resolveConnectToken` to link the Telegram chat.

```typescript
// platform/apps/api/src/modules/telegram/telegram.service.ts
import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class TelegramService {
  private readonly secret: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow('AI_KEY_ENCRYPTION_SECRET');
  }

  generateConnectToken(userId: string, appSubdomain: string): string {
    const payload = JSON.stringify({
      userId,
      appSubdomain,
      exp: Date.now() + TOKEN_TTL_MS,
    });
    const hmac = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${hmac}`;
  }

  resolveConnectToken(token: string): { userId: string; appSubdomain: string } | null {
    try {
      const [payloadB64, sig] = token.split('.');
      if (!payloadB64 || !sig) return null;

      const payloadStr = Buffer.from(payloadB64, 'base64url').toString();
      const expected = crypto.createHmac('sha256', this.secret).update(payloadStr).digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

      const payload = JSON.parse(payloadStr);
      if (payload.exp < Date.now()) return null;
      return { userId: payload.userId, appSubdomain: payload.appSubdomain };
    } catch {
      return null;
    }
  }

  async getChatId(userId: string, appId: string): Promise<string | null> {
    const connection = await this.prisma.telegramConnection.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    return connection?.chatId ?? null;
  }

  async getChatIdBySubdomain(userId: string, appSubdomain: string): Promise<string | null> {
    const connection = await this.prisma.telegramConnection.findFirst({
      where: { userId, app: { subdomain: appSubdomain } },
    });
    return connection?.chatId ?? null;
  }

  async saveConnection(userId: string, appId: string, chatId: string) {
    return this.prisma.telegramConnection.upsert({
      where: { userId_appId: { userId, appId } },
      update: { chatId },
      create: { userId, appId, chatId },
    });
  }
}
```

- [ ] **Step 3: Create telegram.controller.ts**

These endpoints are called by generated apps (not by platform frontend).

```typescript
// platform/apps/api/src/modules/telegram/internal-api.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest();
    const secret = request.headers['x-internal-secret'];
    const expected = this.config.get('INTERNAL_API_SECRET');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid internal API secret');
    }
    return true;
  }
}
```

```typescript
// platform/apps/api/src/modules/telegram/telegram.controller.ts
import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InternalApiGuard } from './internal-api.guard';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Telegram')
@UseGuards(InternalApiGuard)
@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private prisma: PrismaService,
  ) {}

  @Get('chat-id')
  @ApiOperation({ summary: 'Get Telegram chatId for a user+app (called by generated apps)' })
  async getChatId(
    @Query('userId') userId: string,
    @Query('appSubdomain') appSubdomain: string,
  ) {
    const chatId = await this.telegramService.getChatIdBySubdomain(userId, appSubdomain);
    return { chatId };
  }

  @Post('connect-token')
  @ApiOperation({ summary: 'Generate a Telegram connect token (called by generated apps)' })
  async generateConnectToken(
    @Body() body: { userId: string; appSubdomain: string },
  ) {
    // Verify the app exists
    const app = await this.prisma.app.findUnique({
      where: { subdomain: body.appSubdomain },
    });
    if (!app) return { token: null };

    const token = this.telegramService.generateConnectToken(body.userId, body.appSubdomain);
    return { token };
  }
}
```

Note: These endpoints are guarded by `InternalApiGuard` which checks the `X-Internal-Secret` header against `INTERNAL_API_SECRET` env var. Generated apps include this secret in their requests to the platform API. This prevents unauthorized access even when the API is exposed via reverse proxy.

- [ ] **Step 4: Create telegram.module.ts**

```typescript
// platform/apps/api/src/modules/telegram/telegram.module.ts
import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 5: Update app.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AppsModule } from './modules/apps/apps.module';
import { AiAccessModule } from './modules/ai-access/ai-access.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AppsModule,
    AiAccessModule,
    TelegramModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Commit**

```bash
git add platform/apps/api/src/modules/telegram/ platform/apps/api/src/app.module.ts
git commit -m "feat(platform): add Telegram API for connect-token and chat-id resolution"
```

---

## Chunk 4: Frontend

### Task 10: Web skeleton — React, Vite, TanStack Router, i18n, shadcn/ui

This task creates the web app structure. It reuses the same patterns and shadcn/ui components as the template.

**Files:**
- Create: `platform/apps/web/package.json`
- Create: `platform/apps/web/tsconfig.json`
- Create: `platform/apps/web/tsconfig.app.json`
- Create: `platform/apps/web/tsconfig.node.json`
- Create: `platform/apps/web/vite.config.ts`
- Create: `platform/apps/web/Dockerfile`
- Create: `platform/apps/web/.dockerignore`
- Create: `platform/apps/web/caddy/Caddyfile`
- Create: `platform/apps/web/index.html`
- Create: `platform/apps/web/src/main.tsx`
- Create: `platform/apps/web/src/styles.css`
- Create: `platform/apps/web/src/lib/utils.ts`
- Create: `platform/apps/web/src/lib/auth.ts`
- Create: `platform/apps/web/src/lib/api.ts`
- Create: `platform/apps/web/src/lib/i18n/index.ts`
- Create: `platform/apps/web/src/lib/i18n/ru.json`
- Create: `platform/apps/web/src/lib/i18n/en.json`
- Create: `platform/apps/web/src/components/theme-provider.tsx`
- Create: `platform/apps/web/src/test/setup.ts`
- Copy: shadcn/ui components from `template/apps/web/src/components/ui/`

- [ ] **Step 1: Create apps/web/package.json**

Same as template with one addition: no `next-themes` needed changes.

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-router": "^1.166.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "i18next": "^25.8.16",
    "lucide-react": "^0.577.0",
    "next-themes": "^0.4.6",
    "radix-ui": "^1.4.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-i18next": "^16.5.6",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.1",
    "@tanstack/router-devtools": "^1.166.3",
    "@tanstack/router-plugin": "^1.166.3",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "jsdom": "^28.1.0",
    "tailwindcss": "^4.2.1",
    "typescript": "~5.9.3",
    "vite": "^7.3.1",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create tsconfig files**

Same as template: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`. Copy from `template/apps/web/`.

- [ ] **Step 3: Create vite.config.ts**

Same as template.

```typescript
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [TanStackRouterVite({ quoteStyle: 'single' }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: Create Dockerfile, .dockerignore, caddy/Caddyfile**

Same as template.

```dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install

COPY . .

FROM base AS dev

CMD ["bun", "run", "vite", "--host", "0.0.0.0"]

FROM base AS build

RUN bun run build

FROM caddy:2-alpine AS prod

COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
```

```
node_modules
dist
```

```
:80 {
    root * /srv
    file_server
    try_files {path} /index.html
    encode gzip zstd

    handle /api/* {
        reverse_proxy api:3001
    }
}
```

- [ ] **Step 5: Create index.html**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ilmarinen</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src/styles.css, src/lib/utils.ts, src/components/theme-provider.tsx, src/test/setup.ts**

Copy these files from `template/apps/web/src/`. They are identical.

- [ ] **Step 7: Create src/lib/auth.ts**

Same token management pattern as template, but platform uses hash-based token from OAuth callback.

```typescript
// platform/apps/web/src/lib/auth.ts
export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function removeToken(): void {
  localStorage.removeItem('token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout(): void {
  removeToken();
  window.location.href = '/';
}
```

- [ ] **Step 8: Create src/lib/api.ts**

```typescript
// platform/apps/web/src/lib/api.ts
import { getToken } from './auth';

const API_BASE = '/api';

export interface User {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  googleId: string;
  isAdmin: boolean;
}

export interface App {
  id: string;
  name: string;
  subdomain: string;
  status: 'CREATING' | 'RUNNING' | 'STOPPED' | 'ERROR';
  errorReason: string | null;
  deployedAt: string | null;
  createdAt: string;
}

export interface AiAccessStatus {
  hasOwnKey: boolean;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

export interface AiAccessRequest {
  id: string;
  status: string;
  user: { id: string; email: string; name: string | null };
  createdAt: string;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  getLoginUrl: () => `${API_BASE}/auth/google`,
  getMe: () => apiFetch<User>('/users/me'),
  updateMe: (data: { name?: string; locale?: string }) =>
    apiFetch<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // Apps
  getApps: () => apiFetch<App[]>('/apps'),
  getApp: (id: string) => apiFetch<App>(`/apps/${id}`),
  createApp: (data: { name: string; subdomain: string }) =>
    apiFetch<App>('/apps', { method: 'POST', body: JSON.stringify(data) }),
  stopApp: (id: string) => apiFetch<App>(`/apps/${id}/stop`, { method: 'PATCH' }),

  // AI Access
  getAiStatus: () => apiFetch<AiAccessStatus>('/ai-access/status'),
  setAiKey: (apiKey: string) =>
    apiFetch('/ai-access/key', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  removeAiKey: () => apiFetch('/ai-access/key', { method: 'DELETE' }),
  requestAiAccess: () => apiFetch('/ai-access/request', { method: 'POST' }),

  // Admin
  getPendingRequests: () => apiFetch<AiAccessRequest[]>('/admin/ai-access/requests'),
  approveRequest: (id: string) =>
    apiFetch(`/admin/ai-access/requests/${id}/approve`, { method: 'POST' }),
  rejectRequest: (id: string) =>
    apiFetch(`/admin/ai-access/requests/${id}/reject`, { method: 'POST' }),
  setPlatformKey: (apiKey: string) =>
    apiFetch('/admin/ai-access/platform-key', { method: 'POST', body: JSON.stringify({ apiKey }) }),
};
```

- [ ] **Step 9: Create i18n files**

```typescript
// platform/apps/web/src/lib/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ru from './ru.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;
```

```json
// platform/apps/web/src/lib/i18n/ru.json
{
  "common": {
    "loading": "Загрузка...",
    "save": "Сохранить",
    "cancel": "Отмена",
    "delete": "Удалить",
    "error": "Ошибка",
    "back": "Назад"
  },
  "auth": {
    "login": "Войти",
    "logout": "Выйти",
    "loginWith": "Войти через Google",
    "tagline": "Создавайте приложения с помощью ИИ"
  },
  "dashboard": {
    "title": "Мои приложения",
    "createApp": "Создать приложение",
    "noApps": "У вас пока нет приложений",
    "status": {
      "CREATING": "Создается...",
      "RUNNING": "Работает",
      "STOPPED": "Остановлено",
      "ERROR": "Ошибка"
    },
    "open": "Открыть",
    "edit": "Редактировать",
    "stop": "Остановить"
  },
  "aiAccess": {
    "title": "Доступ к ИИ",
    "ownKey": "Свой API ключ OpenAI",
    "enterKey": "Введите API ключ",
    "removeKey": "Удалить ключ",
    "requestFree": "Запросить бесплатный доступ",
    "requestPending": "Запрос на рассмотрении",
    "requestApproved": "Доступ одобрен",
    "requestRejected": "Запрос отклонен",
    "hasKey": "Ключ установлен"
  },
  "admin": {
    "title": "Админ-панель",
    "requests": "Запросы доступа к ИИ",
    "noRequests": "Нет ожидающих запросов",
    "approve": "Одобрить",
    "reject": "Отклонить"
  }
}
```

```json
// platform/apps/web/src/lib/i18n/en.json
{
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "error": "Error",
    "back": "Back"
  },
  "auth": {
    "login": "Log in",
    "logout": "Log out",
    "loginWith": "Log in with Google",
    "tagline": "Create apps with AI"
  },
  "dashboard": {
    "title": "My Apps",
    "createApp": "Create App",
    "noApps": "You don't have any apps yet",
    "status": {
      "CREATING": "Creating...",
      "RUNNING": "Running",
      "STOPPED": "Stopped",
      "ERROR": "Error"
    },
    "open": "Open",
    "edit": "Edit",
    "stop": "Stop"
  },
  "aiAccess": {
    "title": "AI Access",
    "ownKey": "Your OpenAI API Key",
    "enterKey": "Enter API Key",
    "removeKey": "Remove Key",
    "requestFree": "Request Free Access",
    "requestPending": "Request Pending",
    "requestApproved": "Access Approved",
    "requestRejected": "Request Rejected",
    "hasKey": "Key Set"
  },
  "admin": {
    "title": "Admin Panel",
    "requests": "AI Access Requests",
    "noRequests": "No pending requests",
    "approve": "Approve",
    "reject": "Reject"
  }
}
```

- [ ] **Step 10: Copy shadcn/ui components**

```bash
cp -r template/apps/web/src/components/ui/ platform/apps/web/src/components/ui/
```

- [ ] **Step 11: Create src/main.tsx**

```typescript
// platform/apps/web/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ThemeProvider } from './components/theme-provider';
import { routeTree } from './routeTree.gen';
import './lib/i18n';
import './styles.css';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 12: Commit**

```bash
git add platform/apps/web/
git commit -m "feat(platform): add web skeleton with React, Vite, i18n, shadcn/ui"
```

---

### Task 11: Frontend routes — login, dashboard, admin

**Files:**
- Create: `platform/apps/web/src/routes/__root.tsx`
- Create: `platform/apps/web/src/routes/index.tsx`
- Create: `platform/apps/web/src/routes/login.tsx`
- Create: `platform/apps/web/src/routes/app.tsx`
- Create: `platform/apps/web/src/routes/app/index.tsx`
- Create: `platform/apps/web/src/routes/app/ai-access.tsx`
- Create: `platform/apps/web/src/routes/app/admin.tsx`

- [ ] **Step 1: Create routes/__root.tsx**

Handles OAuth token from hash fragment.

```typescript
// platform/apps/web/src/routes/__root.tsx
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { setToken } from '@/lib/auth';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle OAuth callback: token is in URL hash
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.slice(7);
      setToken(token);
      window.history.replaceState({}, '', '/');
      navigate({ to: '/app' });
    }
  }, [navigate]);

  return <Outlet />;
}
```

- [ ] **Step 2: Create routes/index.tsx (root redirect)**

```typescript
// platform/apps/web/src/routes/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { isAuthenticated } from '@/lib/auth';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (isAuthenticated()) {
      throw redirect({ to: '/app' });
    } else {
      throw redirect({ to: '/login' });
    }
  },
});
```

- [ ] **Step 3: Create routes/login.tsx**

```typescript
// platform/apps/web/src/routes/login.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isAuthenticated } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: '/app' });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Ilmarinen</h1>
        <p className="text-muted-foreground">{t('auth.tagline')}</p>
        <a href={api.getLoginUrl()}>
          <Button size="lg">{t('auth.loginWith')}</Button>
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create routes/app.tsx (authenticated layout)**

```typescript
// platform/apps/web/src/routes/app.tsx
import { createFileRoute, Outlet, useNavigate, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, logout } from '@/lib/auth';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/app')({
  component: AppLayout,
});

function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate({ to: '/login' });
      return;
    }
    api.getMe().then(setUser).catch(() => {
      logout();
    });
  }, [navigate]);

  if (!user) return <div className="p-4">{t('common.loading')}</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/app">
            <h1 className="font-semibold text-lg">Ilmarinen</h1>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/app/ai-access" className="text-sm text-muted-foreground hover:text-foreground">
              {t('aiAccess.title')}
            </Link>
            {user.isAdmin && (
              <Link to="/app/admin" className="text-sm text-muted-foreground hover:text-foreground">
                {t('admin.title')}
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            {t('auth.logout')}
          </Button>
        </div>
      </header>
      <main className="p-4 max-w-4xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create routes/app/index.tsx (dashboard)**

```typescript
// platform/apps/web/src/routes/app/index.tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type App } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/app/')({
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getApps().then(setApps).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('dashboard.title')}</h2>
        <Button>{t('dashboard.createApp')}</Button>
      </div>

      {apps.length === 0 ? (
        <p className="text-muted-foreground">{t('dashboard.noApps')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{app.name}</CardTitle>
                <StatusBadge status={app.status} />
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{app.subdomain}.{import.meta.env.VITE_APPS_BASE_DOMAIN}</p>
                {app.status === 'RUNNING' && (
                  <a
                    href={`https://${app.subdomain}.${import.meta.env.VITE_APPS_BASE_DOMAIN}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">{t('dashboard.open')}</Button>
                  </a>
                )}
                {app.status === 'ERROR' && app.errorReason && (
                  <p className="text-sm text-destructive">{app.errorReason}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: App['status'] }) {
  const { t } = useTranslation();
  const variant = status === 'RUNNING' ? 'default' : status === 'ERROR' ? 'destructive' : 'secondary';
  return <Badge variant={variant as any}>{t(`dashboard.status.${status}`)}</Badge>;
}
```

- [ ] **Step 6: Create routes/app/ai-access.tsx**

```typescript
// platform/apps/web/src/routes/app/ai-access.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AiAccessStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/app/ai-access')({
  component: AiAccessPage,
});

function AiAccessPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AiAccessStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStatus = () => {
    api.getAiStatus().then(setStatus).finally(() => setLoading(false));
  };

  useEffect(loadStatus, []);

  const handleSetKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await api.setAiKey(apiKey.trim());
      setApiKey('');
      loadStatus();
    } catch { alert(t('common.error')); }
  };

  const handleRemoveKey = async () => {
    try {
      await api.removeAiKey();
      loadStatus();
    } catch { alert(t('common.error')); }
  };

  const handleRequestAccess = async () => {
    try {
      await api.requestAiAccess();
      loadStatus();
    } catch { alert(t('common.error')); }
  };

  if (loading || !status) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t('aiAccess.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('aiAccess.ownKey')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.hasOwnKey ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('aiAccess.hasKey')}</span>
              <Button variant="outline" size="sm" onClick={handleRemoveKey}>
                {t('aiAccess.removeKey')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={t('aiAccess.enterKey')}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button onClick={handleSetKey}>{t('common.save')}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!status.hasOwnKey && (
        <Card>
          <CardHeader>
            <CardTitle>{t('aiAccess.requestFree')}</CardTitle>
          </CardHeader>
          <CardContent>
            {status.requestStatus === null && (
              <Button onClick={handleRequestAccess}>{t('aiAccess.requestFree')}</Button>
            )}
            {status.requestStatus === 'PENDING' && (
              <p className="text-sm text-muted-foreground">{t('aiAccess.requestPending')}</p>
            )}
            {status.requestStatus === 'APPROVED' && (
              <p className="text-sm text-green-600">{t('aiAccess.requestApproved')}</p>
            )}
            {status.requestStatus === 'REJECTED' && (
              <p className="text-sm text-destructive">{t('aiAccess.requestRejected')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create routes/app/admin.tsx**

```typescript
// platform/apps/web/src/routes/app/admin.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AiAccessRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/app/admin')({
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<AiAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = () => {
    api.getPendingRequests().then(setRequests).finally(() => setLoading(false));
  };

  useEffect(loadRequests, []);

  const handleApprove = async (id: string) => {
    try {
      await api.approveRequest(id);
      loadRequests();
    } catch { alert(t('common.error')); }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectRequest(id);
      loadRequests();
    } catch { alert(t('common.error')); }
  };

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t('admin.title')}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.requests')}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground">{t('admin.noRequests')}</p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="font-medium">{req.user.email}</p>
                    <p className="text-sm text-muted-foreground">{req.user.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(req.id)}>
                      {t('admin.approve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReject(req.id)}>
                      {t('admin.reject')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add platform/apps/web/src/routes/
git commit -m "feat(platform): add frontend routes — login, dashboard, ai-access, admin"
```

---

## Chunk 5: Validation

### Task 12: Validate platform builds

- [ ] **Step 1: Install API dependencies and check TypeScript**

```bash
cd platform/apps/api && bun install && bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Install Web dependencies, build (generates route tree via Vite plugin), and check TypeScript**

```bash
cd platform/apps/web && bun install && bunx vite build && bunx tsc --noEmit
```

Expected: No errors. The TanStack Router Vite plugin generates `routeTree.gen.ts` during the build.

- [ ] **Step 3: Validate Prisma schema**

```bash
cd platform/apps/api && bunx prisma validate
```

Expected: `The schema at ... is valid.`

- [ ] **Step 4: Run API tests**

```bash
cd platform/apps/api && bunx jest
```

Expected: All tests pass (auth service, apps service, ai-access service, telegram service).

- [ ] **Step 5: Commit fixes if needed**

```bash
git add platform/ && git commit -m "fix(platform): address build validation issues"
```

Only if fixes were needed. Stage specific files if changes are narrow.
