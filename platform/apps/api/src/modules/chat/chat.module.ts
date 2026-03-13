// platform/apps/api/src/modules/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { AiAccessModule } from '../ai-access/ai-access.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AiAccessModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
