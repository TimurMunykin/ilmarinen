// platform/apps/api/src/modules/ai-access/admin-ai-access.controller.ts
import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AiAccessService } from './ai-access.service';

@ApiTags('Admin — AI Access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/ai-access')
export class AdminAiAccessController {
  constructor(private aiAccessService: AiAccessService) {}

  @Get('requests')
  @ApiOperation({ summary: 'List pending AI access requests' })
  getPendingRequests() {
    return this.aiAccessService.getPendingRequests();
  }

  @Post('requests/:id/approve')
  @ApiOperation({ summary: 'Approve an AI access request' })
  approve(@Param('id') id: string) {
    return this.aiAccessService.approveRequest(id);
  }

  @Post('requests/:id/reject')
  @ApiOperation({ summary: 'Reject an AI access request' })
  reject(@Param('id') id: string) {
    return this.aiAccessService.rejectRequest(id);
  }

  @Post('platform-key')
  @ApiOperation({ summary: 'Set the platform shared OpenAI API key' })
  setPlatformKey(@Body() body: { apiKey: string }) {
    return this.aiAccessService.setPlatformKey(body.apiKey);
  }
}
