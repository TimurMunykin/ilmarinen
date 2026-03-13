import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAccessService } from '../ai-access/ai-access.service';
import { buildChatSystemPrompt } from './chat-prompts';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private aiAccessService: AiAccessService,
    private config: ConfigService,
  ) {}

  async createSession(userId: string) {
    const session = await this.prisma.chatSession.create({
      data: { userId },
    });
    return { id: session.id };
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');
    return session;
  }

  async sendMessage(sessionId: string, userId: string, content: string) {
    await this.getSession(sessionId, userId);

    const messageCount = await this.prisma.chatMessage.findMany({
      where: { sessionId },
    });
    if (messageCount.length >= 30) {
      throw new BadRequestException('Message limit reached');
    }

    await this.prisma.chatMessage.create({
      data: { sessionId, role: 'user', content },
    });

    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const apiKey = await this.aiAccessService.resolveApiKey(userId);
    if (!apiKey) throw new BadRequestException('NO_AI_KEY');

    const client = new OpenAI({ apiKey });
    const model = this.config.get('OPENAI_MODEL', 'gpt-4o');

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildChatSystemPrompt() },
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const rawContent = response.choices[0]?.message?.content ?? '{}';
    const parsed: { message: string; spec: unknown | null } = JSON.parse(rawContent);

    const metadata = parsed.spec ? { spec: parsed.spec } : null;

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: parsed.message,
        metadata: metadata ?? undefined,
      },
    });

    return {
      id: assistantMessage.id,
      role: 'assistant' as const,
      content: assistantMessage.content,
      metadata: assistantMessage.metadata,
      createdAt: assistantMessage.createdAt,
    };
  }
}
