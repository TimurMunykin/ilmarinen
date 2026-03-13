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
