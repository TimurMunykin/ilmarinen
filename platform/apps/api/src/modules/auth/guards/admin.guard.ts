import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<{ user?: { email?: string } }>();
    const email = request.user?.email;
    if (!email) throw new ForbiddenException('ADMIN_ONLY');

    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!adminEmails.includes(email.toLowerCase())) {
      throw new ForbiddenException('ADMIN_ONLY');
    }
    return true;
  }
}
