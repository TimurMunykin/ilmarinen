// platform/apps/api/src/modules/chat/chat.controller.ts
import { Controller, Post, Get, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create a new chat session' })
  async createSession(@CurrentUser() user: { id: string }) {
    return this.chatService.createSession(user.id);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a chat session with messages' })
  async getSession(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.chatService.getSession(id, user.id);
  }

  @Post('sessions/:id/messages')
  @ApiOperation({ summary: 'Send a message in a chat session' })
  async sendMessage(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    if (!body.content || body.content.trim() === '') {
      throw new BadRequestException('content must not be empty');
    }
    return this.chatService.sendMessage(id, user.id, body.content);
  }
}
