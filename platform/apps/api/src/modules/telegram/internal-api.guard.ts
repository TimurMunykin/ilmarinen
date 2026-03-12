// platform/apps/api/src/modules/telegram/internal-api.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest();
    const secret = request.headers['x-internal-secret'];
    const expected = this.config.get('INTERNAL_API_SECRET');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid internal API secret');
    }
    return true;
  }
}
