// platform/apps/api/src/modules/ai-access/ai-access.service.test.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiAccessService } from './ai-access.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AiAccessService', () => {
  let service: AiAccessService;
  let prisma: {
    aiKey: { findFirst: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    aiAccessRequest: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      aiKey: { findFirst: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      aiAccessRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        AiAccessService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('a]b[c!d@e#f$g%h^i&j*k(l)m_n+o=p') },
        },
      ],
    }).compile();

    service = module.get(AiAccessService);
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt a key correctly', () => {
      const original = 'sk-test-key-1234567890';
      const encrypted = (service as any).encrypt(original);

      expect(encrypted).not.toBe(original);
      expect(encrypted.startsWith('v1:')).toBe(true);

      const decrypted = (service as any).decrypt(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe('resolveApiKey', () => {
    it('should return user own key if available', async () => {
      prisma.aiKey.findFirst.mockResolvedValueOnce({ encryptedKey: 'v1:fake' });

      // We can't easily test decryption with mock data, so just verify the flow
      const encrypted = (service as any).encrypt('sk-user-key');
      prisma.aiKey.findFirst.mockReset();
      prisma.aiKey.findFirst.mockResolvedValueOnce({ encryptedKey: encrypted });

      const result = await service.resolveApiKey('u1');

      expect(result).toBe('sk-user-key');
      expect(prisma.aiKey.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('should fall back to platform shared key if user has approved request', async () => {
      prisma.aiKey.findFirst
        .mockResolvedValueOnce(null); // no user key

      const encrypted = (service as any).encrypt('sk-platform-key');
      prisma.aiAccessRequest.findFirst.mockResolvedValue({ status: 'APPROVED' });
      prisma.aiKey.findFirst.mockResolvedValueOnce({ encryptedKey: encrypted }); // platform key

      const result = await service.resolveApiKey('u1');
      expect(result).toBe('sk-platform-key');
    });

    it('should return null if no key available', async () => {
      prisma.aiKey.findFirst.mockResolvedValue(null);
      prisma.aiAccessRequest.findFirst.mockResolvedValue(null);

      const result = await service.resolveApiKey('u1');
      expect(result).toBeNull();
    });
  });
});
