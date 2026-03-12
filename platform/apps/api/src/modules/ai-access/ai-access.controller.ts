// platform/apps/api/src/modules/ai-access/ai-access.controller.ts
import { Controller, Get, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiAccessService } from './ai-access.service';

@ApiTags('AI Access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-access')
export class AiAccessController {
  constructor(private aiAccessService: AiAccessService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get AI access status for current user' })
  getStatus(@CurrentUser() user: { id: string }) {
    return this.aiAccessService.getAccessStatus(user.id);
  }

  @Post('key')
  @ApiOperation({ summary: 'Set own OpenAI API key' })
  async setKey(@CurrentUser() user: { id: string }, @Body() body: { apiKey: string }) {
    await this.aiAccessService.setUserKey(user.id, body.apiKey);
    return { success: true };
  }

  @Delete('key')
  @ApiOperation({ summary: 'Remove own API key' })
  async removeKey(@CurrentUser() user: { id: string }) {
    await this.aiAccessService.removeUserKey(user.id);
    return { success: true };
  }

  @Post('request')
  @ApiOperation({ summary: 'Request free AI access' })
  async requestAccess(@CurrentUser() user: { id: string }) {
    const req = await this.aiAccessService.requestAccess(user.id);
    return { id: req.id, status: req.status };
  }
}
