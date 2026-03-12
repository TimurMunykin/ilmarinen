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
