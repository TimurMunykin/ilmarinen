// platform/apps/api/src/modules/telegram/telegram.service.ts
import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class TelegramService {
  private readonly secret: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow('AI_KEY_ENCRYPTION_SECRET');
  }

  generateConnectToken(userId: string, appSubdomain: string): string {
    const payload = JSON.stringify({
      userId,
      appSubdomain,
      exp: Date.now() + TOKEN_TTL_MS,
    });
    const hmac = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${hmac}`;
  }

  resolveConnectToken(token: string): { userId: string; appSubdomain: string } | null {
    try {
      const [payloadB64, sig] = token.split('.');
      if (!payloadB64 || !sig) return null;

      const payloadStr = Buffer.from(payloadB64, 'base64url').toString();
      const expected = crypto.createHmac('sha256', this.secret).update(payloadStr).digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

      const payload = JSON.parse(payloadStr);
      if (payload.exp < Date.now()) return null;
      return { userId: payload.userId, appSubdomain: payload.appSubdomain };
    } catch {
      return null;
    }
  }

  async getChatId(userId: string, appId: string): Promise<string | null> {
    const connection = await this.prisma.telegramConnection.findUnique({
      where: { userId_appId: { userId, appId } },
    });
    return connection?.chatId ?? null;
  }

  async getChatIdBySubdomain(userId: string, appSubdomain: string): Promise<string | null> {
    const connection = await this.prisma.telegramConnection.findFirst({
      where: { userId, app: { subdomain: appSubdomain } },
    });
    return connection?.chatId ?? null;
  }

  async saveConnection(userId: string, appId: string, chatId: string) {
    return this.prisma.telegramConnection.upsert({
      where: { userId_appId: { userId, appId } },
      update: { chatId },
      create: { userId, appId, chatId },
    });
  }
}
