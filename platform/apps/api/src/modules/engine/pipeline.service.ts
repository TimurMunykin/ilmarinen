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
      await this.apps.updateStatus(appId, AppStatus.CREATING);
      this.logger.log(`[${subdomain}] Starting pipeline...`);

      appDir = await this.scaffold.scaffold(appName, subdomain);

      await this.database.createDatabase(subdomain);
      dbCreated = true;

      await this.generateWithRetries(userId, spec, appDir, subdomain);

      await this.apps.updateSpec(appId, spec);

      await this.deploy.deploy(appDir, subdomain);

      await this.apps.markDeployed(appId);
      this.logger.log(`[${subdomain}] Pipeline completed successfully`);
    } catch (error: any) {
      this.logger.error(`[${subdomain}] Pipeline failed: ${error.message}`);
      await this.apps.updateStatus(appId, AppStatus.ERROR, error.message);

      if (dbCreated) {
        try { await this.database.dropDatabase(subdomain); } catch {}
      }
      if (appDir) {
        try { await this.scaffold.cleanup(subdomain); } catch {}
      }
    }
  }

  async prepareEdit(
    appId: string,
    userId: string,
    subdomain: string,
    spec: AppSpec,
  ): Promise<MigrationCheck | null> {
    const appsDir = process.env.APPS_DIR ?? path.join(process.env.HOME!, 'apps');
    const appDir = path.join(appsDir, subdomain);

    try {
      await this.generateWithRetries(userId, spec, appDir, subdomain);

      const migrationCheck = await this.checkMigration(appDir, subdomain);
      if (migrationCheck.hasDestructiveChanges) {
        return migrationCheck;
      }

      this.deployEdit(appId, subdomain, appDir, spec);
      return null;
    } catch (error: any) {
      this.logger.error(`[${subdomain}] Edit prepare failed: ${error.message}`);
      await this.apps.updateStatus(appId, AppStatus.ERROR, error.message);
      throw error;
    }
  }

  async confirmEdit(appId: string, subdomain: string, spec: AppSpec): Promise<void> {
    const appsDir = process.env.APPS_DIR ?? path.join(process.env.HOME!, 'apps');
    const appDir = path.join(appsDir, subdomain);
    this.deployEdit(appId, subdomain, appDir, spec);
  }

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
