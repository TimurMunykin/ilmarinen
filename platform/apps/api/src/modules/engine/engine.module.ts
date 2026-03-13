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
