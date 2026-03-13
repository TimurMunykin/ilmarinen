import { Test } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let prisma: { $executeRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $executeRawUnsafe: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DatabaseService);
  });

  describe('createDatabase', () => {
    it('should create user and database for subdomain', async () => {
      await service.createDatabase('my-pet');

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      // First call: CREATE USER
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('CREATE USER');
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('my_pet');
      // Second call: CREATE DATABASE
      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('CREATE DATABASE');
      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('my_pet');
    });

    it('should sanitize subdomain for SQL identifiers', async () => {
      await service.createDatabase('my-pet');
      // Hyphens replaced with underscores in SQL identifiers
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('my_pet');
    });
  });

  describe('dropDatabase', () => {
    it('should drop database and user', async () => {
      await service.dropDatabase('my-pet');

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('DROP DATABASE');
      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('DROP USER');
    });
  });
});
