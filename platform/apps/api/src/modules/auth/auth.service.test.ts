import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: { user: { upsert: jest.Mock } };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { upsert: jest.fn() } };
    jwtService = { sign: jest.fn().mockReturnValue('mock-token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const values: Record<string, string> = {
                RSA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('validateOAuthLogin', () => {
    it('should upsert user and return user data', async () => {
      const user = { id: 'u1', email: 'test@example.com', name: 'Test', googleId: 'g1' };
      prisma.user.upsert.mockResolvedValue(user);

      const result = await authService.validateOAuthLogin({
        googleId: 'g1',
        email: 'test@example.com',
        name: 'Test',
      });

      expect(result).toEqual(user);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { googleId: 'g1' },
        update: { email: 'test@example.com', name: 'Test' },
        create: { googleId: 'g1', email: 'test@example.com', name: 'Test' },
      });
    });
  });

  describe('generateToken', () => {
    it('should generate JWT with user data', () => {
      const token = authService.generateToken({ id: 'u1', email: 'test@example.com' });
      expect(token).toBe('mock-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'u1', email: 'test@example.com' },
      );
    });
  });

  describe('generateAppToken', () => {
    it('should generate RSA-signed JWT for app delegation', () => {
      const token = authService.generateAppToken(
        { id: 'u1', email: 'test@example.com', name: 'Test' },
        'my-pet',
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'u1', email: 'test@example.com', name: 'Test', app: 'my-pet' },
        { privateKey: expect.any(String), algorithm: 'RS256', expiresIn: '7d' },
      );
    });
  });
});
