import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getTelegramConnectUrl(userId: string): Promise<{ url: string | null; connected: boolean }> {
    const ilmarinenUrl = this.config.getOrThrow('ILMARINEN_URL');
    const subdomain = this.config.getOrThrow('APP_SUBDOMAIN');

    try {
      // Check connection status via platform API
      const statusRes = await fetch(
        `${ilmarinenUrl}/api/telegram/chat-id?userId=${userId}&appSubdomain=${subdomain}`,
      );
      if (statusRes.ok) {
        const { chatId } = await statusRes.json() as { chatId: string | null };
        if (chatId) return { url: null, connected: true };
      }

      // Request connect token from Ilmarinen platform
      const res = await fetch(`${ilmarinenUrl}/api/telegram/connect-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, appSubdomain: subdomain }),
      });
      if (!res.ok) return { url: null, connected: false };
      const { token } = await res.json() as { token: string };
      return { url: `https://t.me/ilmarinen_bot?start=${token}`, connected: false };
    } catch {
      return { url: null, connected: false };
    }
  }
}
