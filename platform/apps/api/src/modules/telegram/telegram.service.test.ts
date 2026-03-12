// platform/apps/api/src/modules/telegram/telegram.service.test.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let prisma: {
    telegramConnection: { findUnique: jest.Mock; findFirst: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      telegramConnection: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-secret-for-hmac-signing') },
        },
      ],
    }).compile();

    service = module.get(TelegramService);
  });

  describe('generateConnectToken', () => {
    it('should generate an HMAC-signed token and resolve it', () => {
      const token = service.generateConnectToken('u1', 'my-pet');
      expect(typeof token).toBe('string');
      expect(token).toContain('.'); // payload.signature format

      const decoded = service.resolveConnectToken(token);
      expect(decoded).toEqual({ userId: 'u1', appSubdomain: 'my-pet' });
    });

    it('should reject a tampered token', () => {
      const token = service.generateConnectToken('u1', 'my-pet');
      const [payload, sig] = token.split('.');
      // Tamper with the signature
      const tampered = `${payload}.${sig.slice(0, -1)}X`;
      expect(service.resolveConnectToken(tampered)).toBeNull();
    });
  });

  describe('getChatId', () => {
    it('should return chatId if connection exists', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue({ chatId: '12345' });

      const result = await service.getChatId('u1', 'app1');
      expect(result).toBe('12345');
    });

    it('should return null if no connection', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue(null);

      const result = await service.getChatId('u1', 'app1');
      expect(result).toBeNull();
    });
  });
});
