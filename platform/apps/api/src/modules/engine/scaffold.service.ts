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
