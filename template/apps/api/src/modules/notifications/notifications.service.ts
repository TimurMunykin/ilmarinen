import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { evaluateCondition } from './notification-rules';

/**
 * Notification rules are injected at build time by the App Engine.
 * Each rule defines: model, condition, and message template.
 *
 * This file provides the cron runner and evaluation engine.
 * The actual rules array is generated per-app.
 */

export interface NotificationRule {
  model: string;
  condition: string;
  template: string;
}

// === GENERATED NOTIFICATION RULES === //
export const NOTIFICATION_RULES: NotificationRule[] = [];
// === END GENERATED NOTIFICATION RULES === //

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private config: ConfigService,
  ) {}

  @Cron('0 9 * * *') // Daily at 9:00 AM
  async checkNotifications() {
    if (NOTIFICATION_RULES.length === 0) return;

    this.logger.log('Checking notification rules...');

    for (const rule of NOTIFICATION_RULES) {
      try {
        await this.evaluateRule(rule);
      } catch (error) {
        this.logger.error(`Error evaluating rule for ${rule.model}`, error);
      }
    }
  }

  private async evaluateRule(rule: NotificationRule) {
    // Get the Prisma model dynamically
    const model = (this.prisma as any)[rule.model.charAt(0).toLowerCase() + rule.model.slice(1)];
    if (!model) {
      this.logger.warn(`Model ${rule.model} not found`);
      return;
    }

    const records = await model.findMany({ include: { user: true } });
    const now = new Date();

    for (const record of records) {
      if (!evaluateCondition(rule.condition, record, now)) continue;

      // Resolve Telegram chatId via platform API
      const chatId = await this.resolveTelegramChatId(record.user?.id);
      if (!chatId) continue;

      const message = this.renderTemplate(rule.template, record);
      await this.telegram.sendMessage(chatId, message);
    }
  }

  private async resolveTelegramChatId(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    const ilmarinenUrl = this.config.get('ILMARINEN_URL');
    const subdomain = this.config.get('APP_SUBDOMAIN');
    if (!ilmarinenUrl) return null;

    try {
      const res = await fetch(
        `${ilmarinenUrl}/api/telegram/chat-id?userId=${userId}&appSubdomain=${subdomain}`,
      );
      if (!res.ok) return null;
      const { chatId } = await res.json() as { chatId: string | null };
      return chatId;
    } catch {
      return null;
    }
  }

  private renderTemplate(template: string, record: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
      const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], record);
      return value != null ? String(value) : '';
    });
  }
}
