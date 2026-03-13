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
