import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: { findUnique: jest.fn; upsert: jest.fn } };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('findOrCreateUser', () => {
    it('should create a new user if not found', async () => {
      const userData = { id: 'user-1', email: 'test@example.com', name: 'Test' };
      prisma.user.upsert.mockResolvedValue(userData);

      const result = await authService.findOrCreateUser({
        email: 'test@example.com',
        name: 'Test',
      });

      expect(result).toEqual(userData);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        update: { name: 'Test' },
        create: { email: 'test@example.com', name: 'Test' },
      });
    });
  });
});
