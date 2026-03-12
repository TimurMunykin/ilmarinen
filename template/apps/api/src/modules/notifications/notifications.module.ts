import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';

@Module({
  providers: [NotificationsService, TelegramService],
  exports: [TelegramService],
})
export class NotificationsModule {}
