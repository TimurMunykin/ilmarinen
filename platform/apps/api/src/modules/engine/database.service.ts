import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a PostgreSQL user and database for a generated app.
   * Uses the subdomain as both username and db name (hyphens → underscores).
   */
  async createDatabase(subdomain: string): Promise<void> {
    const id = this.sanitize(subdomain);
    this.logger.log(`Creating database and user: ${id}`);

    await this.prisma.$executeRawUnsafe(
      `CREATE USER "${id}" WITH PASSWORD '${id}'`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE DATABASE "${id}" OWNER "${id}"`,
    );
  }

  /**
   * Drop a generated app's database and user. Used for cleanup on failure.
   */
  async dropDatabase(subdomain: string): Promise<void> {
    const id = this.sanitize(subdomain);
    this.logger.log(`Dropping database and user: ${id}`);

    try {
      await this.prisma.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${id}" WITH (FORCE)`,
      );
      await this.prisma.$executeRawUnsafe(`DROP USER IF EXISTS "${id}"`);
    } catch (error) {
      this.logger.warn(`Failed to drop database ${id}`, error);
    }
  }

  /** Replace hyphens with underscores and validate as safe SQL identifier. */
  private sanitize(subdomain: string): string {
    const id = subdomain.replace(/-/g, '_');
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(id)) {
      throw new Error(`Invalid database identifier: ${id}`);
    }
    return id;
  }
}
