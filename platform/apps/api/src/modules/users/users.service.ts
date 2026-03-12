import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly adminEmails: string[];

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.adminEmails = (config.get<string>('ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    return { ...user, isAdmin: this.adminEmails.includes(user.email.toLowerCase()) };
  }

  async updateUser(id: string, data: { name?: string; locale?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }
}
