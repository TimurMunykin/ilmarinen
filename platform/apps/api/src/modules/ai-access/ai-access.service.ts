// platform/apps/api/src/modules/ai-access/ai-access.service.ts
import * as crypto from 'crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiAccessService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Resolve the OpenAI API key for a user. Priority: own key > approved request + platform key > null. */
  async resolveApiKey(userId: string): Promise<string | null> {
    // 1. Check user's own key
    const userKey = await this.prisma.aiKey.findFirst({ where: { userId } });
    if (userKey) return this.decrypt(userKey.encryptedKey);

    // 2. Check if user has approved access request
    const approved = await this.prisma.aiAccessRequest.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!approved) return null;

    // 3. Get platform shared key
    const platformKey = await this.prisma.aiKey.findFirst({ where: { userId: null } });
    if (!platformKey) return null;

    return this.decrypt(platformKey.encryptedKey);
  }

  async setUserKey(userId: string, apiKey: string) {
    const encrypted = this.encrypt(apiKey);
    // Delete existing key if any, then create new
    await this.prisma.aiKey.deleteMany({ where: { userId } });
    return this.prisma.aiKey.create({
      data: { encryptedKey: encrypted, userId, provider: 'openai' },
    });
  }

  async removeUserKey(userId: string) {
    await this.prisma.aiKey.deleteMany({ where: { userId } });
  }

  async requestAccess(userId: string) {
    const existing = await this.prisma.aiAccessRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (existing) return existing;
    return this.prisma.aiAccessRequest.create({ data: { userId } });
  }

  async getAccessStatus(userId: string) {
    const userKey = await this.prisma.aiKey.findFirst({ where: { userId } });
    if (userKey) return { hasOwnKey: true, requestStatus: null };

    const request = await this.prisma.aiAccessRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { hasOwnKey: false, requestStatus: request?.status ?? null };
  }

  // --- Admin methods ---

  async getPendingRequests() {
    return this.prisma.aiAccessRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveRequest(requestId: string) {
    return this.prisma.aiAccessRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED' },
    });
  }

  async rejectRequest(requestId: string) {
    return this.prisma.aiAccessRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });
  }

  async setPlatformKey(apiKey: string) {
    const encrypted = this.encrypt(apiKey);
    await this.prisma.aiKey.deleteMany({ where: { userId: null } });
    return this.prisma.aiKey.create({
      data: { encryptedKey: encrypted, provider: 'openai' },
    });
  }

  // --- Encryption ---

  private encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(encryptedValue: string): string {
    const parts = encryptedValue.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new InternalServerErrorException('AI_KEY_DECRYPT_FAILED');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private encryptionKey(): Buffer {
    const secret = this.config.get<string>('AI_KEY_ENCRYPTION_SECRET');
    if (!secret) throw new InternalServerErrorException('AI_KEY_ENCRYPTION_SECRET_MISSING');
    return crypto.createHash('sha256').update(secret).digest();
  }
}
