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
