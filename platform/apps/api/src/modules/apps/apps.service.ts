// platform/apps/api/src/modules/apps/apps.service.ts
import { Injectable } from '@nestjs/common';
import { AppStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AppsService {
  constructor(private prisma: PrismaService) {}

  async getUserApps(userId: string) {
    return this.prisma.app.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApp(id: string) {
    return this.prisma.app.findUniqueOrThrow({ where: { id } });
  }

  async createApp(userId: string, data: { name: string; subdomain: string }) {
    return this.prisma.app.create({
      data: { ...data, userId },
    });
  }

  async updateStatus(id: string, status: AppStatus, errorReason?: string) {
    return this.prisma.app.update({
      where: { id },
      data: { status, ...(errorReason ? { errorReason } : {}) },
    });
  }

  async updateSpec(id: string, spec: object) {
    return this.prisma.app.update({
      where: { id },
      data: { spec: spec as any },
    });
  }

  async markDeployed(id: string) {
    return this.prisma.app.update({
      where: { id },
      data: { status: 'RUNNING' as AppStatus, deployedAt: new Date(), errorReason: null },
    });
  }
}
