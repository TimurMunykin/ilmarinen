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
