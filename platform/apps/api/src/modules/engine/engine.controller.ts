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
