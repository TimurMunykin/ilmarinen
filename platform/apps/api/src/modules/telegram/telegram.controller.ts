// platform/apps/api/src/modules/telegram/telegram.controller.ts
import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InternalApiGuard } from './internal-api.guard';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Telegram')
@UseGuards(InternalApiGuard)
@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private prisma: PrismaService,
  ) {}

  @Get('chat-id')
  @ApiOperation({ summary: 'Get Telegram chatId for a user+app (called by generated apps)' })
  async getChatId(
    @Query('userId') userId: string,
    @Query('appSubdomain') appSubdomain: string,
  ) {
    const chatId = await this.telegramService.getChatIdBySubdomain(userId, appSubdomain);
    return { chatId };
  }

  @Post('connect-token')
  @ApiOperation({ summary: 'Generate a Telegram connect token (called by generated apps)' })
  async generateConnectToken(
    @Body() body: { userId: string; appSubdomain: string },
  ) {
    // Verify the app exists
    const app = await this.prisma.app.findUnique({
      where: { subdomain: body.appSubdomain },
    });
    if (!app) return { token: null };

    const token = this.telegramService.generateConnectToken(body.userId, body.appSubdomain);
    return { token };
  }
}
