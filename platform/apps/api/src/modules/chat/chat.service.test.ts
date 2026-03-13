import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AiAccessService } from '../ai-access/ai-access.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock openai
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  message: 'What would you like to build?',
                  spec: null,
                }),
              },
            }],
          }),
        },
      },
    })),
  };
});

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chatSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    chatMessage: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let aiAccessService: { resolveApiKey: jest.Mock };

  beforeEach(async () => {
    prisma = {
      chatSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    aiAccessService = {
      resolveApiKey: jest.fn().mockResolvedValue('sk-test-key'),
    };

    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiAccessService, useValue: aiAccessService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('gpt-4o'),
          },
        },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  describe('createSession', () => {
    it('should call prisma.chatSession.create with userId', async () => {
      prisma.chatSession.create.mockResolvedValue({ id: 'session-1', userId: 'user-1' });

      const result = await service.createSession('user-1');

      expect(prisma.chatSession.create).toHaveBeenCalledWith({
        data: { userId: 'user-1' },
      });
      expect(result).toEqual({ id: 'session-1' });
    });
  });

  describe('getSession', () => {
    it('should return session when user matches', async () => {
      const session = {
        id: 'session-1',
        userId: 'user-1',
        messages: [],
      };
      prisma.chatSession.findUnique.mockResolvedValue(session);

      const result = await service.getSession('session-1', 'user-1');

      expect(result).toEqual(session);
    });

    it('should throw ForbiddenException when userId does not match', async () => {
      prisma.chatSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        messages: [],
      });

      await expect(service.getSession('session-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when session does not exist', async () => {
      prisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(service.getSession('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage', () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      messages: [],
    };

    const existingMessages = [
      { id: 'msg-1', role: 'user', content: 'Hello', sessionId: 'session-1', createdAt: new Date() },
    ];

    const assistantMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'What would you like to build?',
      metadata: null,
      sessionId: 'session-1',
      createdAt: new Date(),
    };

    beforeEach(() => {
      prisma.chatSession.findUnique.mockResolvedValue(session);
      // First findMany call (count check) returns few messages
      // Second findMany call (history) returns history
      prisma.chatMessage.findMany
        .mockResolvedValueOnce(existingMessages)
        .mockResolvedValueOnce(existingMessages);
      prisma.chatMessage.create
        .mockResolvedValueOnce({ id: 'user-msg', role: 'user', content: 'Hello', sessionId: 'session-1', createdAt: new Date() })
        .mockResolvedValueOnce(assistantMessage);
    });

    it('should save user message, call OpenAI, save AI response, and return DTO', async () => {
      const result = await service.sendMessage('session-1', 'user-1', 'Hello');

      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'user', content: 'Hello' }) }),
      );
      expect(aiAccessService.resolveApiKey).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({
        id: assistantMessage.id,
        role: 'assistant',
        content: assistantMessage.content,
      });
    });

    it('should throw BadRequestException when resolveApiKey returns null', async () => {
      aiAccessService.resolveApiKey.mockResolvedValue(null);

      await expect(service.sendMessage('session-1', 'user-1', 'Hello')).rejects.toThrow(
        new BadRequestException('NO_AI_KEY'),
      );
    });

    it('should throw BadRequestException when messages count >= 30', async () => {
      const thirtyMessages = Array.from({ length: 30 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user',
        content: `Message ${i}`,
        sessionId: 'session-1',
        createdAt: new Date(),
      }));

      prisma.chatMessage.findMany.mockReset();
      prisma.chatMessage.findMany.mockResolvedValueOnce(thirtyMessages);

      await expect(service.sendMessage('session-1', 'user-1', 'Hello')).rejects.toThrow(
        new BadRequestException('Message limit reached'),
      );
    });
  });
});
