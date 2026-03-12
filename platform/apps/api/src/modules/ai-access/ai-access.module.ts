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
